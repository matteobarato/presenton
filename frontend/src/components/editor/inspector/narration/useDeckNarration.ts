import { computed, inject, provide, ref, type InjectionKey, type Ref } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Presentation, Slide } from '@/api/types'
import { presentationKeys } from '@/api/presentations'
import { generateSpeakerNotes } from '@/api/speakerNotes'
import { playbackKeys } from '@/api/playback'
import { deleteTts, generateTtsAsync, listTtsLanguages, ttsKeys, useTts } from '@/api/tts'
import { useAsyncTask } from '@/composables/useAsyncTask'
import { useTtsLanguage } from '@/composables/useTtsLanguage'
import { toast } from '@/components/ui/sonner'
import { audioForSlide, narrationState, type NarrationState } from './narration-state'

export const failToast = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong')

/**
 * Deck narration state shared by the per-slide and deck-wide parts of the Narration tab:
 * the language, the recorded audio, and the one TTS task (it resumes after a reload).
 */
export function useDeckNarration(presentationId: Ref<string>, presentation: Ref<Presentation>) {
  const qc = useQueryClient()

  const { data: languages } = useQuery({ queryKey: ['tts-languages'], queryFn: listTtsLanguages, staleTime: Infinity })
  const { language, setLanguage } = useTtsLanguage(presentationId, presentation)
  const languageName = computed(() => languages.value?.find((l) => l.code === language.value)?.name ?? language.value)

  const { data: tts } = useTts(presentationId, language)
  const audioOf = (s: Slide) => audioForSlide(s, tts.value?.audios)
  const stateOf = (s: Slide): NarrationState => narrationState(s, audioOf(s))

  const slides = computed(() => [...presentation.value.slides].sort((a, b) => a.index - b.index))
  /** How many slides are in each narration state. */
  const counts = computed(() => {
    const c: Record<NarrationState, number> = { missing: 0, ready: 0, stale: 0, translated: 0 }
    for (const s of slides.value) c[stateOf(s)]++
    return c
  })

  // Notes for the whole deck
  const refreshPresentation = () => qc.invalidateQueries({ queryKey: presentationKeys.one(presentationId.value) })
  const generateNotes = useMutation({
    mutationFn: () => generateSpeakerNotes(presentationId.value),
    onSuccess: refreshPresentation,
    onError: failToast,
  })

  // TTS task
  const taskId = ref<string | null>(null)
  const refreshTts = () => qc.invalidateQueries({ queryKey: ttsKeys.status(presentationId.value, language.value) })
  const {
    task,
    status: taskStatus,
    error: taskError,
    start,
    clear,
  } = useAsyncTask(taskId, {
    storageKey: `presenton.task.tts.${presentationId.value}`,
    onDone: () => {
      void refreshTts()
      // Present reads playback; it must not play the audio it had before.
      void qc.invalidateQueries({ queryKey: playbackKeys.one(presentationId.value) })
      toast.success('Narration is ready')
      clear()
    },
  })
  const running = computed(() => taskStatus.value === 'pending')
  const progress = computed(() => {
    const d = task.value?.data as { completed_slides?: number; total_slides?: number } | null | undefined
    return d?.total_slides ? Math.round(((d.completed_slides ?? 0) / d.total_slides) * 100) : 0
  })
  /** Which slides the running task records; null = the whole deck. */
  const runningIndexes = ref<number[] | null>(null)
  const startTts = useMutation({
    mutationFn: (body: { slide_indexes?: number[]; regenerate?: boolean }) =>
      generateTtsAsync(presentationId.value, { language: language.value, ...body }),
    onSuccess: (t, body) => {
      runningIndexes.value = body.slide_indexes ?? null
      if (t.id) start(t.id)
    },
    onError: failToast,
  })
  const canStart = computed(() => Boolean(language.value) && !running.value && !startTts.isPending.value)
  const generateAll = () => startTts.mutate({})
  const generateSlide = (index: number) => startTts.mutate({ slide_indexes: [index], regenerate: true })
  /** Is this slide's voice being recorded right now? (A resumed task does not say which slides, so assume all.) */
  const isRecording = (index: number) => running.value && (runningIndexes.value === null || runningIndexes.value.includes(index))

  const removeTts = useMutation({
    mutationFn: () => deleteTts(presentationId.value, language.value),
    onSuccess: () => void refreshTts(),
    onError: failToast,
  })

  return {
    languages,
    language,
    languageName,
    setLanguage,
    tts,
    audioOf,
    stateOf,
    counts,
    generateNotes,
    task,
    taskError,
    running,
    progress,
    startTts,
    canStart,
    generateAll,
    generateSlide,
    isRecording,
    removeTts,
  }
}

export type DeckNarration = ReturnType<typeof useDeckNarration>

const KEY: InjectionKey<DeckNarration> = Symbol('deck-narration')
export const provideDeckNarration = (n: DeckNarration) => provide(KEY, n)
export function injectDeckNarration(): DeckNarration {
  const n = inject(KEY)
  if (!n) throw new Error('useDeckNarration was not provided')
  return n
}
