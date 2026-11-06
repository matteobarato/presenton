<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Presentation, Slide } from '@/api/types'
import { presentationKeys } from '@/api/presentations'
import { generateSpeakerNotes } from '@/api/speakerNotes'
import { playbackKeys } from '@/api/playback'
import { deleteTts, generateTtsAsync, listTtsLanguages, ttsKeys, useTts } from '@/api/tts'
import { useAsyncTask } from '@/composables/useAsyncTask'
import { useNoteDraft } from '@/composables/useNoteDraft'
import { useTtsLanguage } from '@/composables/useTtsLanguage'
import { useEditorStore } from '@/stores/editor'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/components/ui/sonner'
import SlideAudioRow from './narration/SlideAudioRow.vue'
import TtsLanguageSelect from './narration/TtsLanguageSelect.vue'
import { audioForSlide } from './narration/narration-state'

const props = defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const editor = useEditorStore()
const qc = useQueryClient()
const idRef = computed(() => props.presentationId)
const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong')

// Language
const { data: languages } = useQuery({ queryKey: ['tts-languages'], queryFn: listTtsLanguages, staleTime: Infinity })
const { language, setLanguage } = useTtsLanguage(idRef, toRef(props, 'presentation'))

// Audio status
const { data: tts } = useTts(idRef, language)
const slides = computed(() => [...props.presentation.slides].sort((a, b) => a.index - b.index))
const selected = ref(new Set<number>())
function setSelected(index: number, on: boolean) {
  const next = new Set(selected.value)
  if (on) next.add(index)
  else next.delete(index)
  selected.value = next
}

// Notes
const refreshPresentation = () => qc.invalidateQueries({ queryKey: presentationKeys.one(props.presentationId) })
const generateNotes = useMutation({
  mutationFn: () => generateSpeakerNotes(props.presentationId),
  onSuccess: refreshPresentation,
  onError: fail,
})
// The active slide's note: autosaved like the notes strip, so typing is never silently dropped.
const { draft, onInput, failureFor } = useNoteDraft(idRef, toRef(() => props.activeSlide))

// TTS task (resumes after reload from sessionStorage)
const taskId = ref<string | null>(null)
const refreshTts = () => qc.invalidateQueries({ queryKey: ttsKeys.status(props.presentationId, language.value) })
const {
  task,
  status: taskStatus,
  error: taskError,
  start,
  clear,
} = useAsyncTask(taskId, {
  storageKey: `presenton.task.tts.${props.presentationId}`,
  onDone: () => {
    void refreshTts()
    // Present reads playback; it must not play the audio it had before.
    void qc.invalidateQueries({ queryKey: playbackKeys.one(props.presentationId) })
    toast.success('Narration is ready')
    clear()
  },
})
const progress = computed(() => {
  const d = task.value?.data as { completed_slides?: number; total_slides?: number } | null | undefined
  return d?.total_slides ? Math.round(((d.completed_slides ?? 0) / d.total_slides) * 100) : 0
})
const running = computed(() => taskStatus.value === 'pending')
const startTts = useMutation({
  mutationFn: (body: { slide_indexes?: number[]; regenerate?: boolean }) =>
    generateTtsAsync(props.presentationId, { language: language.value, ...body }),
  onSuccess: (t) => {
    if (t.id) start(t.id)
  },
  onError: fail,
})
const regenerateSelected = () => startTts.mutate({ slide_indexes: [...selected.value].sort((a, b) => a - b), regenerate: true })

// Delete
const confirmDelete = ref(false)
const removeTts = useMutation({
  mutationFn: () => deleteTts(props.presentationId, language.value),
  onSuccess: () => {
    confirmDelete.value = false
    void refreshTts()
  },
  onError: fail,
})
</script>

<template>
  <section class="flex flex-col gap-4 p-3" aria-label="Narration">
    <div class="flex flex-col gap-2">
      <h3 class="text-[12px] font-semibold text-[#f6f8f9]">Speaker notes</h3>
      <Button
        size="sm"
        variant="secondary"
        :disabled="generateNotes.isPending.value || editor.generating"
        @click="generateNotes.mutate()"
      >
        Generate notes for all slides
      </Button>
      <template v-if="activeSlide">
        <Textarea
          :model-value="draft"
          rows="4"
          :aria-label="`Speaker note for slide ${activeSlide.index + 1}`"
          :readonly="editor.generating"
          @update:model-value="onInput(String($event))"
        />
        <p v-if="failureFor(activeSlide)" role="alert" class="text-[11px] text-danger-text">{{ failureFor(activeSlide) }}</p>
      </template>
    </div>

    <div class="flex flex-col gap-2">
      <h3 class="text-[12px] font-semibold text-[#f6f8f9]">Narration</h3>
      <TtsLanguageSelect :model-value="language" :languages="languages ?? []" :disabled="running" @update:model-value="setLanguage" />
      <div class="flex flex-wrap gap-2">
        <Button size="sm" :disabled="running || !language || startTts.isPending.value" @click="startTts.mutate({})">
          Generate narration
        </Button>
        <Button size="sm" variant="outline" :disabled="running || selected.size === 0" @click="regenerateSelected">
          Regenerate selected
        </Button>
        <Button size="sm" variant="ghost" :disabled="running || !tts?.audios.length" @click="confirmDelete = true">
          Delete narration
        </Button>
      </div>
      <div v-if="running" class="flex flex-col gap-1" role="status">
        <Progress :model-value="progress" aria-label="Narration progress" />
        <span class="text-[11px] text-muted">{{ task?.message || 'Generating narration…' }}</span>
      </div>
      <p v-if="taskError" role="alert" class="text-[11px] text-danger-text">{{ taskError }}</p>
    </div>

    <ul class="flex flex-col gap-2" aria-label="Slide narration">
      <SlideAudioRow
        v-for="s in slides"
        :key="s.id ?? s.index"
        :slide="s"
        :audio="audioForSlide(s, tts?.audios)"
        :selected="selected.has(s.index)"
        @update:selected="setSelected(s.index, $event)"
      />
    </ul>

    <Dialog v-model:open="confirmDelete">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete narration?</DialogTitle>
          <DialogDescription>This removes the recorded audio for this language. Speaker notes are kept.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="confirmDelete = false">Cancel</Button>
          <Button variant="destructive" :disabled="removeTts.isPending.value" @click="removeTts.mutate()">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
