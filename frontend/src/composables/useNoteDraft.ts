import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { presentationKeys } from '@/api/presentations'
import { updateSpeakerNotes } from '@/api/speakerNotes'
import type { Presentation, Slide } from '@/api/types'
import { slideKey } from '@/stores/editor'

export const NOTE_SAVE_DELAY_MS = 800

/**
 * The editable speaker note of the active slide: an 800 ms debounced autosave, flushed when the slide
 * changes and when the owner unmounts.
 *
 * - Unsaved text is recorded by slide id, and its index is resolved at save time, so a reorder inside
 *   the debounce window still saves to the right slide.
 * - The text goes into the `['presentation', id]` cache at input time, not after the PUT, so a queued
 *   structural PATCH (which sends the cache) cannot write the old note back.
 * - A refetch never overwrites a dirty draft.
 */
export function useNoteDraft(presentationId: Ref<string>, slide: Ref<Slide | null | undefined>) {
  const queryClient = useQueryClient()

  const draft = ref(slide.value?.speaker_note ?? '')
  const dirty = ref(false)
  // The error belongs to the slide whose save failed.
  const failure = ref<{ key: string; message: string } | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: { key: string; fallbackIndex: number; note: string } | null = null

  function writeCache(index: number, note: string) {
    queryClient.setQueryData<Presentation>(presentationKeys.one(presentationId.value), (deck) =>
      deck ? { ...deck, slides: deck.slides.map((s) => (s.index === index ? { ...s, speaker_note: note } : s)) } : deck,
    )
  }

  function resolveIndex(key: string, fallback: number): number {
    const deck = queryClient.getQueryData<Presentation>(presentationKeys.one(presentationId.value))
    return deck?.slides.find((s) => s.id === key)?.index ?? fallback
  }

  /** Saves the pending text now. On failure it stays pending, so the next edit or flush retries. */
  async function flush() {
    clearTimeout(timer)
    timer = undefined
    if (!pending) return
    const job = pending
    pending = null
    const index = resolveIndex(job.key, job.fallbackIndex)
    try {
      await updateSpeakerNotes(presentationId.value, [{ slide_index: index, speaker_note: job.note }])
      if (failure.value?.key === job.key) failure.value = null
      if (!pending && slide.value && job.key === slideKey(slide.value)) dirty.value = draft.value !== job.note
    } catch (e) {
      pending ??= job
      if (slide.value && job.key === slideKey(slide.value)) dirty.value = true
      failure.value = { key: job.key, message: e instanceof Error && e.message ? e.message : 'Could not save the notes.' }
    }
  }

  /** Call after the user typed. `text` is for callers whose v-model lags the input event. */
  function onInput(text?: unknown) {
    const s = slide.value
    if (!s) return
    if (typeof text === 'string') draft.value = text
    dirty.value = true
    failure.value = null
    pending = { key: slideKey(s), fallbackIndex: s.index, note: draft.value }
    writeCache(resolveIndex(pending.key, s.index), draft.value)
    clearTimeout(timer)
    timer = setTimeout(flush, NOTE_SAVE_DELAY_MS)
  }

  /** Forget unsaved text (the note is about to be replaced). */
  function discard() {
    clearTimeout(timer)
    timer = undefined
    pending = null
    dirty.value = false
    failure.value = null
  }

  /** Show `note` (e.g. freshly generated notes) for the slide at `index`. */
  function replace(note: string, index: number) {
    discard()
    if (slide.value?.index === index) draft.value = note
    writeCache(index, note)
  }

  function fail(message: string) {
    if (slide.value) failure.value = { key: slideKey(slide.value), message }
  }

  // Sync flush: runs before the props change reaches the draft, so the old text is saved for the old slide.
  watch(
    () => (slide.value ? slideKey(slide.value) : null),
    () => {
      void flush()
      draft.value = slide.value?.speaker_note ?? ''
      dirty.value = false
    },
    { flush: 'sync' },
  )
  // A refetch (e.g. an edit from the other note editor) may replace the note; never clobber unsaved typing.
  watch(
    () => slide.value?.speaker_note,
    (note) => {
      if (!dirty.value) draft.value = note ?? ''
    },
  )
  onBeforeUnmount(() => void flush())

  const failureFor = (s: Slide | null | undefined) => (s && failure.value?.key === slideKey(s) ? failure.value.message : null)

  return { draft, dirty, onInput, flush, discard, replace, fail, failureFor }
}
