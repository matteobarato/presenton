import {
  computed,
  getCurrentScope,
  hasInjectionContext,
  inject,
  onScopeDispose,
  provide,
  ref,
  watch,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  animationKeys,
  deleteAnimation,
  generateAnimations,
  generateAnimationsAsync,
  getAnimations,
  putAnimation,
} from '@/api/animations'
import { presentationKeys } from '@/api/presentations'
import type { AnimationTween, AsyncTask, Presentation, Slide, SlideAnimation } from '@/api/types'
import type { EffectId } from '@/motion/effects'
import { applyEffect, applyPreset as presetTweens, constrainTween, type PresetId } from '@/motion/plan'
import { slideKey } from '@/stores/editor'

export const ANIMATION_SAVE_DELAY_MS = 600

export { animationKeys }

type AnimationsData = { slides: SlideAnimation[] }

/** The deck-wide animation read, shared by the Motion tab, timeline and export card. */
export function useAnimations(presentationId: Ref<string>) {
  return useQuery({
    queryKey: () => animationKeys.one(presentationId.value),
    queryFn: () => getAnimations(presentationId.value),
    enabled: () => Boolean(presentationId.value),
  })
}

const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)
const copy = (tweens: AnimationTween[] | undefined) => (tweens ?? []).map((t) => ({ ...t, from_values: { ...t.from_values } }))

type SaveJob = { presentationId: string; slideId: string; key: string; fallbackIndex: number; tweens: AnimationTween[]; seq: number }

export interface SlideAnimationApi {
  animation: ComputedRef<SlideAnimation | undefined>
  draft: Ref<AnimationTween[]>
  dirty: ComputedRef<boolean>
  error: Ref<string | null>
  busy: ComputedRef<boolean>
  setEffect(target: string, effect: EffectId): void
  patchTween(target: string, patch: Partial<AnimationTween>): void
  applyPreset(p: PresetId): void
  generate(opts?: { force?: boolean }): Promise<void>
  generateAll(): Promise<AsyncTask>
  clear(): Promise<void>
  save(): Promise<void>
}

export const SLIDE_ANIMATION_KEY: InjectionKey<SlideAnimationApi> = Symbol('slide-animation')

/**
 * The animation plan of one slide: a local draft that drives the preview at once and saves (PUT) 600 ms
 * after the last edit, the way `useNoteDraft` handles speaker notes.
 *
 * - The pending save is a snapshot taken at edit time, so a flush on slide switch writes to the slide the
 *   draft belongs to; its index is resolved by slide id at save time.
 * - A failed save keeps the draft and the pending job, and sets `error`; the next edit or `save()` retries.
 * - A refetch never overwrites a dirty draft.
 * - Unsupported (smart) slides and slides without animatable elements make every edit a no-op: no request.
 * - Inside the editor this returns the shared instance its provider built for the active slide (the
 *   arguments are then ignored); elsewhere it builds its own.
 */
export function useSlideAnimation(presentationId: Ref<string>, slide: Ref<Slide>): SlideAnimationApi {
  return useSlideAnimationContext() ?? createSlideAnimation(presentationId, slide)
}

/**
 * The active slide's animation, provided once by the editor (`provideSlideAnimation`) so the Motion tab,
 * the timeline and the canvas preview share one draft and one pending save. Null outside a provider.
 */
export function useSlideAnimationContext(): SlideAnimationApi | null {
  return hasInjectionContext() ? inject(SLIDE_ANIMATION_KEY, null) : null
}

/** Builds the active slide's animation state and provides it to descendants. */
export function provideSlideAnimation(presentationId: Ref<string>, slide: Ref<Slide>): SlideAnimationApi {
  const api = createSlideAnimation(presentationId, slide)
  provide(SLIDE_ANIMATION_KEY, api)
  return api
}

function createSlideAnimation(presentationId: Ref<string>, slide: Ref<Slide>): SlideAnimationApi {
  const queryClient = useQueryClient()
  const query = useAnimations(presentationId)

  // By slide id first: after a reorder/add/delete the cached indexes are stale until the refetch lands.
  const animation = computed(() => {
    const slides = query.data.value?.slides
    const id = slide.value.id
    return id ? slides?.find((s) => s.slide_id === id) : slides?.find((s) => s.index === slide.value.index)
  })
  const editable = computed(() => {
    const a = animation.value
    return Boolean(a && a.status !== 'unsupported' && a.targets.length > 0)
  })

  const draft = ref<AnimationTween[]>(copy(animation.value?.tweens))
  const isDirty = ref(false)
  const error = ref<string | null>(null)
  const generating = ref(false)
  const saving = ref(0)
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: SaveJob | null = null
  let seq = 0

  function writeEntries(id: string, entries: SlideAnimation[]) {
    queryClient.setQueryData<AnimationsData>(animationKeys.one(id), (data) => {
      if (!data) return { slides: entries }
      const byId = new Map(entries.map((e) => [e.slide_id, e]))
      return { ...data, slides: data.slides.map((s) => byId.get(s.slide_id) ?? s) }
    })
  }

  /** The slide's current index, from the deck (the animations cache may predate a reorder). */
  function resolveIndex(job: SaveJob): number {
    const deck = queryClient.getQueryData<Presentation>(presentationKeys.one(job.presentationId))
    return deck?.slides.find((s) => s.id === job.slideId)?.index ?? job.fallbackIndex
  }

  const isCurrent = (job: { key: string; presentationId: string }) =>
    job.key === slideKey(slide.value) && job.presentationId === presentationId.value

  function cancel() {
    clearTimeout(timer)
    timer = undefined
    pending = null
  }

  /** Saves the pending draft now. */
  async function save() {
    clearTimeout(timer)
    timer = undefined
    if (!pending) return
    const job = pending
    pending = null
    saving.value++
    try {
      const body = job.tweens.map((t) => constrainTween(t, {}))
      const saved = await putAnimation(job.presentationId, resolveIndex(job), body)
      writeEntries(job.presentationId, [saved])
      if (isCurrent(job)) {
        error.value = null
        if (!pending && seq === job.seq) isDirty.value = false
      }
    } catch (e) {
      pending ??= job
      if (isCurrent(job)) error.value = message(e, 'Could not save the animation.')
    } finally {
      saving.value--
    }
  }

  function edit(next: AnimationTween[]) {
    const a = animation.value
    if (!a || !editable.value) return
    draft.value = next
    isDirty.value = true
    error.value = null
    pending = {
      presentationId: presentationId.value,
      slideId: a.slide_id,
      key: slideKey(slide.value),
      fallbackIndex: slide.value.index,
      tweens: copy(next),
      seq: ++seq,
    }
    clearTimeout(timer)
    timer = setTimeout(() => void save(), ANIMATION_SAVE_DELAY_MS)
  }

  function setEffect(target: string, effect: EffectId) {
    edit(applyEffect(draft.value, target, effect))
  }

  function patchTween(target: string, patch: Partial<AnimationTween>) {
    if (!draft.value.some((t) => t.target === target)) return
    edit(draft.value.map((t) => (t.target === target ? constrainTween(t, patch) : t)))
  }

  function applyPreset(p: PresetId) {
    edit(presetTweens(p, animation.value?.targets ?? []))
  }

  /** Plans this slide only (missing/stale, or always with `force`) and shows the result. */
  async function generate(opts: { force?: boolean } = {}) {
    const a = animation.value
    if (!a || !editable.value) return
    const id = presentationId.value
    const key = slideKey(slide.value)
    cancel()
    generating.value = true
    error.value = null
    try {
      const res = await generateAnimations(id, { slide_indexes: [slide.value.index], force: opts.force ?? false })
      writeEntries(id, res.slides)
      const mine = res.slides.find((s) => s.slide_id === a.slide_id)
      if (mine && isCurrent({ key, presentationId: id })) {
        draft.value = copy(mine.tweens)
        isDirty.value = false
      }
    } catch (e) {
      if (isCurrent({ key, presentationId: id })) error.value = message(e, 'Could not generate the animation.')
    } finally {
      generating.value = false
    }
  }

  /** Starts planning the whole deck; the caller tracks the task and invalidates `animationKeys.one` when done. */
  async function generateAll(): Promise<AsyncTask> {
    await save()
    return generateAnimationsAsync(presentationId.value, {})
  }

  /** Drops the stored plan (DELETE): the slide is "not planned" again. */
  async function clear() {
    const a = animation.value
    if (!a || !editable.value) return
    const id = presentationId.value
    const key = slideKey(slide.value)
    cancel()
    draft.value = []
    isDirty.value = false
    error.value = null
    saving.value++
    try {
      await deleteAnimation(id, slide.value.index)
      await queryClient.invalidateQueries({ queryKey: animationKeys.one(id) })
    } catch (e) {
      if (isCurrent({ key, presentationId: id })) error.value = message(e, 'Could not clear the animation.')
    } finally {
      saving.value--
    }
  }

  // Sync: runs before the new slide's plan reaches the draft, so a dirty draft is saved for its own slide.
  watch(
    () => `${presentationId.value}:${slideKey(slide.value)}`,
    () => {
      void save()
      draft.value = copy(animation.value?.tweens)
      isDirty.value = false
      error.value = null
    },
    { flush: 'sync' },
  )
  // A refetch (or a save elsewhere) may bring new tweens; never clobber unsaved edits.
  watch(
    () => animation.value?.tweens,
    (tweens) => {
      if (!isDirty.value) draft.value = copy(tweens)
    },
  )
  if (getCurrentScope()) onScopeDispose(() => void save())

  return {
    animation,
    draft,
    dirty: computed(() => isDirty.value),
    error,
    busy: computed(() => generating.value || saving.value > 0),
    setEffect,
    patchTween,
    applyPreset,
    generate,
    generateAll,
    clear,
    save,
  }
}
