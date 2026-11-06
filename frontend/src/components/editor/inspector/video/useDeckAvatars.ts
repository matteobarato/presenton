import { computed, inject, provide, ref, watch, type InjectionKey, type Ref } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Presentation, Slide } from '@/api/types'
import { ApiError } from '@/api/errors'
import { playbackKeys } from '@/api/playback'
import { presentationKeys } from '@/api/presentations'
import {
  addPlaceholder,
  deletePortrait,
  deleteSlideVideo,
  getAvatarGeneration,
  getAvatarPreview,
  getVideos,
  removePlaceholder,
  slidePlans,
  startAvatarGeneration,
  uploadPortrait,
  uploadSlideVideo,
  videoKeys,
  type AvatarSlidePlan,
} from '@/api/videos'
import { useAsyncTask } from '@/composables/useAsyncTask'
import { failToast, type DeckNarration } from '../narration/useDeckNarration'
import { chipFor, hasVideoPlaceholder, slideBlocker, type AvatarChipKind } from './avatar-state'

/**
 * Avatar videos of a deck: portrait, per-slide placeholder and video, and the one HeyGen
 * generation run (it resumes after a reload). Avatars follow the narration language.
 */
export function useDeckAvatars(presentationId: Ref<string>, presentation: Ref<Presentation>, narration: DeckNarration) {
  const qc = useQueryClient()
  const { language } = narration

  const { data: videos } = useQuery({ queryKey: () => videoKeys.all(presentationId.value), queryFn: () => getVideos(presentationId.value) })
  const { data: generation } = useQuery({
    queryKey: () => videoKeys.generation(presentationId.value),
    queryFn: () => getAvatarGeneration(presentationId.value),
  })
  const { data: preview } = useQuery({
    queryKey: () => videoKeys.preview(presentationId.value, language.value),
    queryFn: () => getAvatarPreview(presentationId.value, language.value || undefined),
    retry: false,
  })

  const slides = computed(() => [...presentation.value.slides].sort((a, b) => a.index - b.index))
  const videoBySlide = computed(() => new Map((videos.value?.videos ?? []).map((v) => [v.slide_index, v])))
  const previewReason = computed(
    () => new Map((preview.value?.slides ?? []).map((s) => [s.slide_index as number, (s.reason as string | undefined) ?? null])),
  )

  // Generation task
  const taskId = ref<string | null>(null)
  const refreshVideos = () => qc.invalidateQueries({ queryKey: videoKeys.all(presentationId.value) })
  const refreshPresentation = () => qc.invalidateQueries({ queryKey: presentationKeys.one(presentationId.value) })
  const { task, status: taskStatus, error: taskError, start } = useAsyncTask(taskId, {
    storageKey: `presenton.task.avatars.${presentationId.value}`,
  })
  watch(
    generation,
    (g) => {
      if (g?.id && g.status === 'pending' && taskId.value !== g.id) start(g.id)
    },
    { immediate: true },
  )
  const running = computed(() => taskStatus.value === 'pending')
  watch(taskStatus, (now, before) => {
    if (before === 'pending' && now !== 'pending') {
      void refreshVideos()
      void refreshPresentation()
      // Present reads playback; it must not play the avatars it had before.
      void qc.invalidateQueries({ queryKey: playbackKeys.one(presentationId.value) })
    }
  })
  const plans = computed<AvatarSlidePlan[]>(() => (task.value?.data ? slidePlans(task.value) : slidePlans(generation.value)))
  const planBySlide = computed(() => new Map(plans.value.map((p) => [p.slide_index, p])))
  const doneCount = computed(() => plans.value.filter((p) => p.state === 'done').length)
  watch(doneCount, (now, before) => {
    if (running.value && now > before) void refreshVideos()
  })
  const progress = computed(() => {
    const total = plans.value.filter((p) => p.state !== 'skipped').length
    return total ? Math.round(((doneCount.value + plans.value.filter((p) => p.state === 'failed').length) / total) * 100) : 0
  })

  const chipOf = (s: Slide): AvatarChipKind =>
    chipFor({
      plan: planBySlide.value.get(s.index),
      hasPlaceholder: hasVideoPlaceholder(s),
      narration: narration.stateOf(s),
      video: videoBySlide.value.get(s.index),
      previewReason: previewReason.value.get(s.index),
    })

  /** Why no avatar can be generated at all right now, or null. */
  const deckBlocker = computed<string | null>(() => {
    if (videos.value && !videos.value.generation_available) return 'Set HEYGEN_API_KEY on the server to generate avatars.'
    if (!videos.value?.portrait) return 'Upload a presenter portrait first.'
    if (running.value) return 'An avatar generation is already running.'
    if (!narration.tts.value) return 'Checking narration…'
    return null
  })
  /** Why this slide cannot get an avatar right now, or null. */
  const blockerFor = (s: Slide): string | null => {
    if (deckBlocker.value) return deckBlocker.value
    const blocker = slideBlocker(hasVideoPlaceholder(s), narration.stateOf(s))
    return blocker ? `This slide ${blocker}.` : null
  }
  /** Slides a whole-deck run would cover: every placeholder slide with up-to-date narration. */
  const placeholderSlides = computed(() => slides.value.filter(hasVideoPlaceholder))
  const eligibleSlides = computed(() =>
    placeholderSlides.value.filter((s) => slideBlocker(true, narration.stateOf(s)) === null),
  )
  const deckRunBlocker = computed<string | null>(() => {
    if (deckBlocker.value) return deckBlocker.value
    if (!placeholderSlides.value.length) return 'No slide has an avatar placeholder yet.'
    if (!eligibleSlides.value.length) return 'Every placeholder slide needs up-to-date narration first.'
    return null
  })

  // Confirmation, then the run
  const confirming = ref(false)
  const pendingIndices = ref<number[]>([])
  function requestGenerate(indices: number[]) {
    pendingIndices.value = indices
    confirming.value = true
  }
  const generate = useMutation({
    mutationFn: (force: boolean) =>
      startAvatarGeneration(presentationId.value, {
        slide_indices: pendingIndices.value,
        language: language.value || undefined,
        force,
      }),
    onSuccess: (t) => {
      confirming.value = false
      if (t.id) start(t.id)
      void qc.invalidateQueries({ queryKey: videoKeys.generation(presentationId.value) })
    },
    onError: (e) => {
      confirming.value = false
      // Another run is already going (409): follow it instead of just reporting.
      const body = e instanceof ApiError && e.status === 409 ? (e.body as { detail?: unknown } | null) : null
      const detail = (body?.detail ?? body) as { task_id?: unknown } | null
      if (typeof detail?.task_id === 'string') start(detail.task_id)
      else if (body) void qc.invalidateQueries({ queryKey: videoKeys.generation(presentationId.value) })
      failToast(e)
    },
  })

  // Portrait
  const portraitMut = useMutation({
    mutationFn: async (file: File | null) => {
      if (file) await uploadPortrait(presentationId.value, file)
      else await deletePortrait(presentationId.value)
    },
    onSuccess: refreshVideos,
    onError: failToast,
  })

  // Per-slide actions
  const busy = ref(new Set<number>())
  async function withBusy(index: number, run: () => Promise<unknown>) {
    busy.value = new Set(busy.value).add(index)
    try {
      await run()
    } catch (e) {
      failToast(e)
    } finally {
      const next = new Set(busy.value)
      next.delete(index)
      busy.value = next
    }
  }
  // Placeholders are a layer of the slide's `ui`, so the canvas needs the new presentation.
  const togglePlaceholder = (s: Slide, on: boolean) =>
    withBusy(s.index, async () => {
      if (on) await addPlaceholder(presentationId.value, s.index)
      else await removePlaceholder(presentationId.value, s.index)
      await Promise.all([refreshPresentation(), refreshVideos()])
    })
  const uploadVideo = (s: Slide, file: File) =>
    withBusy(s.index, async () => {
      await uploadSlideVideo(presentationId.value, s.index, file)
      await Promise.all([refreshPresentation(), refreshVideos()])
    })
  const removeVideo = (s: Slide) =>
    withBusy(s.index, async () => {
      await deleteSlideVideo(presentationId.value, s.index)
      await refreshVideos()
    })

  return {
    videos,
    videoBySlide,
    planBySlide,
    task,
    taskError,
    running,
    progress,
    chipOf,
    blockerFor,
    deckBlocker,
    placeholderSlides,
    eligibleSlides,
    deckRunBlocker,
    confirming,
    pendingIndices,
    requestGenerate,
    generate,
    portraitMut,
    busy,
    togglePlaceholder,
    uploadVideo,
    removeVideo,
  }
}

export type DeckAvatars = ReturnType<typeof useDeckAvatars>

const KEY: InjectionKey<DeckAvatars> = Symbol('deck-avatars')
export const provideDeckAvatars = (a: DeckAvatars) => provide(KEY, a)
export function injectDeckAvatars(): DeckAvatars {
  const a = inject(KEY)
  if (!a) throw new Error('useDeckAvatars was not provided')
  return a
}
