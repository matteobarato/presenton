<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { Sparkles } from 'lucide-vue-next'
import { presentationKeys } from '@/api/presentations'
import { generateSpeakerNotes, updateSpeakerNotes } from '@/api/speakerNotes'
import type { Presentation, Slide } from '@/api/types'
import { useEditorStore } from '@/stores/editor'

const SAVE_DELAY_MS = 800

const props = defineProps<{ presentationId: string; slide: Slide }>()
const editor = useEditorStore()
const queryClient = useQueryClient()

const draft = ref(props.slide.speaker_note ?? '')
const dirty = ref(false)
const error = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let pendingIndex: number | null = null

const save = useMutation({
  mutationFn: (n: { slide_index: number; speaker_note: string }) => updateSpeakerNotes(props.presentationId, [n]),
})
const generate = useMutation({
  mutationFn: (index: number) => generateSpeakerNotes(props.presentationId, { slide_indexes: [index], regenerate: true }),
})

function writeCache(index: number, note: string) {
  queryClient.setQueryData<Presentation>(presentationKeys.one(props.presentationId), (deck) =>
    deck ? { ...deck, slides: deck.slides.map((s) => (s.index === index ? { ...s, speaker_note: note } : s)) } : deck,
  )
}

/** Saves the pending draft now, for the slide it was typed on. */
async function flush() {
  clearTimeout(timer)
  timer = undefined
  if (pendingIndex === null) return
  const index = pendingIndex
  const note = draft.value
  pendingIndex = null
  dirty.value = false
  try {
    await save.mutateAsync({ slide_index: index, speaker_note: note })
    writeCache(index, note)
  } catch (e) {
    error.value = e instanceof Error && e.message ? e.message : 'Could not save the notes.'
  }
}

function onInput() {
  dirty.value = true
  error.value = ''
  pendingIndex = props.slide.index
  clearTimeout(timer)
  timer = setTimeout(flush, SAVE_DELAY_MS)
}

// Sync flush: runs before the props change reaches the draft, so the old text is saved for the old slide.
watch(
  () => props.slide.id ?? props.slide.index,
  () => {
    void flush()
    draft.value = props.slide.speaker_note ?? ''
    dirty.value = false
    error.value = ''
  },
  { flush: 'sync' },
)
// A refetch (e.g. an edit from the Narration tab) may replace the note; never clobber unsaved typing.
watch(
  () => props.slide.speaker_note,
  (note) => {
    if (!dirty.value) draft.value = note ?? ''
  },
)

async function onGenerate() {
  const index = props.slide.index
  error.value = ''
  clearTimeout(timer)
  pendingIndex = null
  dirty.value = false
  try {
    const deck = await generate.mutateAsync(index)
    const note = deck.slides.find((s) => s.index === index)?.speaker_note ?? ''
    if (props.slide.index === index) draft.value = note
    writeCache(index, note)
  } catch (e) {
    error.value = e instanceof Error && e.message ? e.message : 'Could not generate notes.'
  }
}

const generating = computed(() => generate.isPending.value)
onBeforeUnmount(() => void flush())
</script>

<template>
  <section aria-label="Speaker notes" class="shrink-0 rounded-panel bg-storyboard p-3">
    <div class="mb-2 flex items-center justify-between">
      <h2 class="text-[11px] font-semibold tracking-wide text-muted uppercase">Speaker notes</h2>
      <button
        type="button"
        :disabled="generating || editor.generating"
        class="inline-flex h-7 items-center gap-1.5 rounded-button px-2.5 text-[11px] font-semibold text-muted transition-colors duration-200 hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-35"
        @click="onGenerate"
      >
        <Sparkles class="size-3.5" aria-hidden="true" />{{ generating ? 'Generating…' : 'Generate' }}
      </button>
    </div>
    <textarea
      v-model="draft"
      rows="3"
      aria-label="Speaker notes"
      placeholder="What will you say on this slide?"
      :disabled="generating"
      class="w-full resize-y rounded-button bg-field px-3 py-2 text-[12px] leading-[1.6] text-[#dce6ec] placeholder:text-muted focus-visible:outline-none disabled:opacity-60"
      @input="onInput"
    />
    <p v-if="error" role="alert" class="mt-1 text-[12px] text-danger-text">{{ error }}</p>
  </section>
</template>
