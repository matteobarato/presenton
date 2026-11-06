<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useMutation } from '@tanstack/vue-query'
import { AudioLines, Loader2, Sparkles } from 'lucide-vue-next'
import type { Slide } from '@/api/types'
import { generateSpeakerNotes } from '@/api/speakerNotes'
import { audioSrc } from '@/api/tts'
import { useNoteDraft } from '@/composables/useNoteDraft'
import { useEditorStore } from '@/stores/editor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { injectDeckNarration } from './useDeckNarration'

/** The active slide's speaker note and its recorded voice. */
const props = defineProps<{ presentationId: string; slide: Slide }>()

const editor = useEditorStore()
const { audioOf, stateOf, canStart, generateSlide, isRecording, progress, task, taskError } = injectDeckNarration()
const { draft, onInput, flush, discard, replace, fail, failureFor } = useNoteDraft(
  toRef(props, 'presentationId'),
  toRef(props, 'slide'),
)

const n = computed(() => props.slide.index + 1)

// Write this slide's note with AI
const writeNote = useMutation({
  mutationFn: (index: number) => generateSpeakerNotes(props.presentationId, { slide_indexes: [index], regenerate: true }),
})
async function onWrite() {
  const index = props.slide.index
  discard()
  try {
    const deck = await writeNote.mutateAsync(index)
    replace(deck.slides.find((s) => s.index === index)?.speaker_note ?? '', index)
  } catch (e) {
    fail(e instanceof Error && e.message ? e.message : 'Could not write the note.')
  }
}

// Voice
const TRANSLATED_HINT = "Translated narration can't be checked against note edits. Regenerate this slide if you changed its note."
const audio = computed(() => audioOf(props.slide))
const state = computed(() => stateOf(props.slide))
const label = computed(() => ({ missing: 'No audio', ready: 'Up to date', stale: 'Out of date', translated: 'Translated' })[state.value])
const recording = computed(() => isRecording(props.slide.index))

async function onGenerate() {
  await flush() // the backend reads the saved note
  generateSlide(props.slide.index)
}
</script>

<template>
  <section class="flex flex-col gap-2" aria-label="Speaker note and voice">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-[12px] font-semibold text-[#f6f8f9]">Speaker note</h3>
      <Button
        size="sm"
        variant="ghost"
        class="-mr-1.5"
        :disabled="writeNote.isPending.value || editor.generating"
        @click="onWrite"
      >
        <Loader2 v-if="writeNote.isPending.value" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <Sparkles v-else class="size-3.5" aria-hidden="true" />
        {{ draft.trim() ? 'Rewrite with AI' : 'Write with AI' }}
      </Button>
    </div>
    <Textarea
      :model-value="draft"
      rows="5"
      :aria-label="`Speaker note for slide ${n}`"
      placeholder="What will you say on this slide?"
      :disabled="writeNote.isPending.value"
      :readonly="editor.generating"
      @update:model-value="onInput(String($event))"
    />
    <p v-if="failureFor(slide)" role="alert" class="text-[11px] text-danger-text">{{ failureFor(slide) }}</p>

    <div class="mt-1 flex flex-col gap-2 rounded-card border border-white/[0.06] p-2.5" :data-state="state" data-testid="slide-voice">
      <div class="flex items-center gap-2">
        <AudioLines class="size-3.5 text-muted" aria-hidden="true" />
        <span class="text-[12px] font-semibold text-[#d4dadd]">Voice</span>
        <Badge
          :title="state === 'translated' ? TRANSLATED_HINT : undefined"
          :variant="state === 'stale' ? 'destructive' : state === 'ready' ? 'default' : 'secondary'"
          class="ml-auto"
        >
          {{ label }}
        </Badge>
      </div>
      <audio v-if="audio" controls preload="none" :src="audioSrc(audio)" :aria-label="`Narration for slide ${n}`" class="h-8 w-full" />
      <p v-if="state === 'stale'" class="text-[11px] text-muted">The note changed since this audio was made.</p>
      <p v-else-if="state === 'translated'" class="text-[11px] text-muted">{{ TRANSLATED_HINT }}</p>
      <p v-else-if="state === 'missing' && !draft.trim()" class="text-[11px] text-muted">Write a note first, then generate its audio.</p>
      <div v-if="recording" class="flex flex-col gap-1" role="status">
        <Progress :model-value="progress" aria-label="Narration progress" />
        <span class="text-[11px] text-muted">{{ task?.message || 'Generating audio…' }}</span>
      </div>
      <p v-if="taskError" role="alert" class="text-[11px] text-danger-text">{{ taskError }}</p>
      <Button
        size="sm"
        :variant="state === 'ready' || state === 'translated' ? 'outline' : 'default'"
        :disabled="!canStart || !draft.trim()"
        @click="onGenerate"
      >
        {{ audio ? 'Regenerate audio' : 'Generate audio' }}
      </Button>
    </div>
  </section>
</template>
