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
import { ApiError } from '@/api/errors'
import { presentationKeys } from '@/api/presentations'
import { deckSaveSettled } from '@/composables/useSlideMutations'
import type { AnimationTween, AsyncTask, Presentation, Slide, SlideAnimation } from '@/api/types'
import type { EffectId } from '@/motion/effects'
import { applyEffect, applyPreset as presetTweens, constrainTween, type PresetId } from '@/motion/plan'
import { slideKey } from '@/stores/editor'

export const ANIMATION_SAVE_DELAY_MS = 600

export { animationKeys }

type AnimationsData = { slides: SlideAnimation[] }

/**
 * False while the editor's deck is still streaming in: the read renders every slide server-side, so it
 * waits for the finished deck (the editor provides it; elsewhere the read is always on).
 */
export const ANIMATIONS_ENABLED_KEY: InjectionKey<Ref<boolean>> = Symbol('animations-enabled')

/** The deck-wide animation read, shared by the Motion tab, timeline and export card. */
export function useAnimations(presentationId: Ref<string>, gate?: Ref<boolean>) {
  const allowed = gate ?? (hasInjectionContext() ? inject(ANIMATIONS_ENABLED_KEY, null) : null)
  return useQuery({
    queryKey: () => animationKeys.one(presentationId.value),
    queryFn: () => getAnimations(presentationId.value),
    enabled: () => Boolean(presentationId.value) && (allowed?.value ?? true),
  })
}

const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)
const copy = (tweens: AnimationTween[] | undefined) => (tweens ?? []).map((t) => ({ ...t, from_values: { ...t.from_values } }))

type SaveJob = {
  presentationId: string
  slideId: string
  /** `targets_signature` of the entry the edit was made against. */
  signature: string | null
  key: string
  fallbackIndex: number
  tweens: AnimationTween[]
  seq: number
}

export const SLIDE_CHANGED_MESSAGE = 'This slide changed — refreshing'

export interface SlideAnimationApi {
  animation: ComputedRef<SlideAnimation | undefined>
  draft: Ref<AnimationTween[]>
  dirty: ComputedRef<boolean>
  error: Ref<string | null>
  busy: ComputedRef<boolean>
  /**
   * The plan no longer fits the slide (`stale_layout`, or the draft names an element the slide no longer
   * has): read-only and not previewed until it is re-planned with `generate({ force: true })`.
   */
  stale: ComputedRef<boolean>
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
 * - Saves run one at a time, newest snapshot last; a PUT carries the slide id and the targets signature
 *   it was made against, and a 409 (the slide changed) drops it, keeps the draft and refetches.
 * - Generate and clear address the slide by index: they wait for the deck's order saves and the PUTs in
 *   flight, then resolve the index by slide id.
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
export function provideSlideAnimation(
  presentationId: Ref<string>,
  slide: Ref<Slide>,
  enabled?: Ref<boolean>,
): SlideAnimationApi {
  if (enabled) provide(ANIMATIONS_ENABLED_KEY, enabled)
  const api = createSlideAnimation(presentationId, slide, enabled)
  provide(SLIDE_ANIMATION_KEY, api)
  return api
}

function createSlideAnimation(presentationId: Ref<string>, slide: Ref<Slide>, enabled?: Ref<boolean>): SlideAnimationApi {
  const queryClient = useQueryClient()
  const query = useAnimations(presentationId, enabled)

  // By slide id first: after a reorder/add/delete the cached indexes are stale until the refetch lands.
  const animation = computed(() => {
    const slides = query.data.value?.slides
    const id = slide.value.id
    return id ? slides?.find((s) => s.slide_id === id) : slides?.find((s) => s.index === slide.value.index)
  })
  // Plannable: generate and clear work. Editable: plannable and the plan still fits the slide.
  const plannable = computed(() => {
    const a = animation.value
    return Boolean(a && a.status !== 'unsupported' && a.targets.length > 0)
  })

  const draft = ref<AnimationTween[]>(copy(animation.value?.tweens))
  // The targets signature of the entry the draft was taken from: a dirty draft outlives refetches, so an
  // edit must be signed with what the draft was made against, not with the entry as it is now.
  const base = ref(animation.value?.targets_signature ?? null)
  const isDirty = ref(false)
  const error = ref<string | null>(null)
  const generating = ref(false)
  const saving = ref(0)
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: SaveJob | null = null
  let seq = 0
  // Per slide id: the newest edit or server result written to the cache; an older PUT response is not applied.
  const applied = new Map<string, number>()

  const stale = computed(() => {
    const a = animation.value
    if (!a || !plannable.value) return false
    if (a.status === 'stale_layout') return true
    // Unsaved edits made against other elements (ids are positional, so they may still all exist).
    if (isDirty.value && base.value !== (a.targets_signature ?? null)) return true
    const ids = new Set(a.targets.map((t) => t.id))
    return draft.value.some((t) => !ids.has(t.target))
  })
  const editable = computed(() => plannable.value && !stale.value)

  function writeEntries(id: string, entries: SlideAnimation[]) {
    queryClient.setQueryData<AnimationsData>(animationKeys.one(id), (data) => {
      if (!data) return { slides: entries }
      const byId = new Map(entries.map((e) => [e.slide_id, e]))
      return { ...data, slides: data.slides.map((s) => byId.get(s.slide_id) ?? s) }
    })
  }

  /** The slide's current index, from the deck (the animations cache may predate a reorder). */
  function resolveIndex(job: Pick<SaveJob, 'presentationId' | 'slideId' | 'fallbackIndex'>): number {
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

  // Saves taken but not sent yet (one per slide, the newest snapshot), and the loop sending them.
  const queue: SaveJob[] = []
  let draining: Promise<void> | null = null

  async function send(job: SaveJob) {
    saving.value++
    try {
      // A reorder still being saved would make the index below point at another slide.
      await deckSaveSettled(job.presentationId)
      const body = job.tweens.map((t) => constrainTween(t, {}))
      const saved = await putAnimation(job.presentationId, resolveIndex(job), body, {
        slide_id: job.slideId,
        targets_signature: job.signature,
      })
      if (job.seq >= (applied.get(job.slideId) ?? 0)) {
        applied.set(job.slideId, job.seq)
        writeEntries(job.presentationId, [saved])
      }
      if (isCurrent(job)) {
        error.value = null
        if (!pending && seq === job.seq) isDirty.value = false
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // The slide moved or its elements changed: this edit can't be stored. The draft stays visible
        // (still dirty, so the refetch doesn't replace it) and the refetch shows what changed.
        if (isCurrent(job)) error.value = SLIDE_CHANGED_MESSAGE
        void queryClient.invalidateQueries({ queryKey: animationKeys.one(job.presentationId) })
      } else {
        if (!pending && !queue.some((q) => q.key === job.key)) pending = job
        if (isCurrent(job)) error.value = message(e, 'Could not save the animation.')
      }
    } finally {
      saving.value--
    }
  }

  function drain(): Promise<void> {
    draining ??= (async () => {
      try {
        while (queue.length) await send(queue.shift()!)
      } finally {
        draining = null
      }
    })()
    return draining
  }

  /** Saves the pending draft now; resolves once every save taken so far has settled. */
  function save(): Promise<void> {
    clearTimeout(timer)
    timer = undefined
    if (pending) {
      const job = pending
      pending = null
      // Only the newest snapshot of a slide is worth sending.
      const older = queue.findIndex((q) => q.key === job.key && q.presentationId === job.presentationId)
      if (older >= 0) queue.splice(older, 1)
      queue.push(job)
    }
    return draining ?? (queue.length ? drain() : Promise.resolve())
  }

  /** Waits for the deck's order saves and this composable's PUTs, then returns the slide's index. */
  async function settledIndex(id: string, slideId: string, fallbackIndex: number): Promise<number> {
    await deckSaveSettled(id)
    if (draining) await draining
    return resolveIndex({ presentationId: id, slideId, fallbackIndex })
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
      signature: base.value,
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
    if (!a || !plannable.value) return
    const id = presentationId.value
    const key = slideKey(slide.value)
    const fallbackIndex = slide.value.index
    cancel()
    generating.value = true
    error.value = null
    try {
      const index = await settledIndex(id, a.slide_id, fallbackIndex)
      const res = await generateAnimations(id, { slide_indexes: [index], force: opts.force ?? false })
      applied.set(a.slide_id, ++seq)
      writeEntries(id, res.slides)
      const mine = res.slides.find((s) => s.slide_id === a.slide_id)
      if (mine && isCurrent({ key, presentationId: id })) {
        // The plan replaces the draft, edits made while it was planned included.
        if (pending?.slideId === a.slide_id) cancel()
        draft.value = copy(mine.tweens)
        base.value = mine.targets_signature ?? null
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
    if (!a || !plannable.value) return
    const id = presentationId.value
    const key = slideKey(slide.value)
    const fallbackIndex = slide.value.index
    cancel()
    draft.value = []
    base.value = a.targets_signature ?? null
    isDirty.value = false
    error.value = null
    applied.set(a.slide_id, ++seq)
    saving.value++
    try {
      await deleteAnimation(id, await settledIndex(id, a.slide_id, fallbackIndex))
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
      base.value = animation.value?.targets_signature ?? null
      isDirty.value = false
      error.value = null
    },
    { flush: 'sync' },
  )
  // A refetch (or a save elsewhere) may bring new tweens or elements; never clobber unsaved edits.
  watch(
    [() => animation.value?.tweens, () => animation.value?.targets_signature],
    ([tweens, signature]) => {
      if (isDirty.value) return
      draft.value = copy(tweens)
      base.value = signature ?? null
    },
  )
  if (getCurrentScope()) onScopeDispose(() => void save())

  return {
    animation,
    draft,
    dirty: computed(() => isDirty.value),
    error,
    busy: computed(() => generating.value || saving.value > 0),
    stale,
    setEffect,
    patchTween,
    applyPreset,
    generate,
    generateAll,
    clear,
    save,
  }
}
