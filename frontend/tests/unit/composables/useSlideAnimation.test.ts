import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { AnimationTween, Slide, SlideAnimation } from '@/api/types'

const api = vi.hoisted(() => ({
  getAnimations: vi.fn(),
  generateAnimations: vi.fn(),
  generateAnimationsAsync: vi.fn(),
  putAnimation: vi.fn(),
  deleteAnimation: vi.fn(),
}))
vi.mock('@/api/animations', async (importActual) => ({
  ...(await importActual<typeof import('@/api/animations')>()),
  ...api,
}))
const deckSave = vi.hoisted(() => ({ settled: vi.fn((): Promise<void> => Promise.resolve()) }))
vi.mock('@/composables/useSlideMutations', async (importActual) => ({
  ...(await importActual<typeof import('@/composables/useSlideMutations')>()),
  deckSaveSettled: deckSave.settled,
}))

import { presentationKeys } from '@/api/presentations'
import { ApiError } from '@/api/errors'
import { animationKeys, ANIMATION_SAVE_DELAY_MS, useSlideAnimation } from '@/composables/useSlideAnimation'

const tween = (target: string, over: Partial<AnimationTween> = {}): AnimationTween => ({
  target,
  from_values: { opacity: 0 },
  duration: 0.6,
  delay: 0,
  ease: 'power2.out',
  ...over,
})

const entry = (index: number, over: Partial<SlideAnimation> = {}): SlideAnimation => ({
  slide_id: `s${index}`,
  index,
  status: 'fresh',
  source: 'llm',
  reset_from_user: false,
  tweens: [tween('e0')],
  targets: [
    { id: 'e0', kind: 'heading', text: 'Title' },
    { id: 'e1', kind: 'text', text: 'Body' },
  ],
  targets_signature: 'sig',
  ...over,
})

const slideOf = (n: number, index = n) => ({ id: `s${n}`, index, content: {}, layout: 'x:a' }) as unknown as Slide

let qc: QueryClient
let slide = ref<Slide>(slideOf(0))
let unmount: (() => void) | null = null

function setup(slides: SlideAnimation[] = [entry(0), entry(1)]) {
  qc.setQueryData(animationKeys.one('p1'), { slides })
  let result!: ReturnType<typeof useSlideAnimation>
  const Host = defineComponent({
    setup() {
      result = useSlideAnimation(ref('p1'), slide)
      return () => h('div')
    },
  })
  const wrapper = mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: qc }]] } })
  unmount = () => wrapper.unmount()
  return { anim: result, wrapper }
}

beforeEach(() => {
  vi.useFakeTimers()
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  slide = ref<Slide>(slideOf(0))
  for (const fn of Object.values(api)) fn.mockReset()
  deckSave.settled.mockReset()
  deckSave.settled.mockImplementation(() => Promise.resolve())
  api.getAnimations.mockImplementation(async () => ({ slides: [entry(0), entry(1)] }))
  api.putAnimation.mockImplementation(async (_id: string, index: number, tweens: AnimationTween[]) =>
    entry(index, { tweens, source: 'user' }),
  )
  api.deleteAnimation.mockResolvedValue(undefined)
})
afterEach(() => {
  unmount?.()
  unmount = null
  vi.useRealTimers()
})

describe('useSlideAnimation', () => {
  it('selects the slide entry from the deck-wide query and seeds the draft', async () => {
    const { anim } = setup()
    await nextTick()
    expect(anim.animation.value?.slide_id).toBe('s0')
    expect(anim.draft.value).toEqual([tween('e0')])
    expect(anim.dirty.value).toBe(false)
  })

  it('debounces rapid edits into one PUT with constrained tweens', async () => {
    const { anim } = setup()
    anim.setEffect('e1', 'rise')
    await vi.advanceTimersByTimeAsync(300)
    anim.patchTween('e1', { duration: 5, delay: 2 })
    await vi.advanceTimersByTimeAsync(200)
    anim.patchTween('e0', { delay: 0.3 })
    expect(anim.dirty.value).toBe(true)
    expect(anim.draft.value.find((t) => t.target === 'e1')).toMatchObject({ duration: 1.2, delay: 1.3 })
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS - 1)
    expect(api.putAnimation).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(api.putAnimation).toHaveBeenCalledTimes(1)
    const [id, index, body] = api.putAnimation.mock.calls[0]!
    expect([id, index]).toEqual(['p1', 0])
    expect(body).toEqual([
      tween('e0', { delay: 0.3 }),
      tween('e1', { from_values: { opacity: 0, y: 32 }, duration: 1.2, delay: 1.3 }),
    ])
    await vi.advanceTimersByTimeAsync(0)
    expect(anim.dirty.value).toBe(false)
    expect(qc.getQueryData<{ slides: SlideAnimation[] }>(animationKeys.one('p1'))!.slides[0]!.source).toBe('user')
  })

  it('keeps the draft and sets error when the PUT fails, and retries on save', async () => {
    api.putAnimation.mockRejectedValueOnce(new Error('Server said no'))
    const { anim } = setup()
    anim.setEffect('e1', 'fade')
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    expect(anim.error.value).toBe('Server said no')
    expect(anim.dirty.value).toBe(true)
    expect(anim.draft.value.map((t) => t.target)).toEqual(['e0', 'e1'])
    await anim.save()
    expect(api.putAnimation).toHaveBeenCalledTimes(2)
    expect(anim.error.value).toBeNull()
    expect(anim.dirty.value).toBe(false)
  })

  it('never lets a refetch overwrite a dirty draft', async () => {
    api.putAnimation.mockRejectedValue(new Error('offline'))
    const { anim } = setup()
    anim.setEffect('e1', 'zoom')
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    qc.setQueryData(animationKeys.one('p1'), { slides: [entry(0, { tweens: [] }), entry(1)] })
    await vi.advanceTimersByTimeAsync(0)
    expect(anim.draft.value.map((t) => t.target)).toEqual(['e0', 'e1'])
  })

  it('takes a refetch into a clean draft', async () => {
    const { anim } = setup()
    qc.setQueryData(animationKeys.one('p1'), { slides: [entry(0, { tweens: [tween('e1')] }), entry(1)] })
    await vi.advanceTimersByTimeAsync(0)
    expect(anim.draft.value).toEqual([tween('e1')])
  })

  it('generate posts this slide only and replaces the draft with the response', async () => {
    api.generateAnimations.mockResolvedValue({ slides: [entry(0, { tweens: [tween('e1', { delay: 0.4 })] })] })
    const { anim } = setup()
    anim.setEffect('e1', 'fade')
    await anim.generate({ force: true })
    expect(api.generateAnimations).toHaveBeenCalledWith('p1', { slide_indexes: [0], force: true })
    expect(anim.draft.value).toEqual([tween('e1', { delay: 0.4 })])
    expect(anim.dirty.value).toBe(false)
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS * 2)
    expect(api.putAnimation).not.toHaveBeenCalled()
    expect(anim.animation.value?.tweens).toEqual([tween('e1', { delay: 0.4 })])
  })

  it('slide switch discards a clean draft without a request', async () => {
    const { anim } = setup([entry(0), entry(1, { tweens: [tween('e1')] })])
    slide.value = slideOf(1)
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    expect(api.putAnimation).not.toHaveBeenCalled()
    expect(anim.draft.value).toEqual([tween('e1')])
  })

  it('slide switch flushes a dirty draft to the slide it belongs to first', async () => {
    const { anim } = setup([entry(0), entry(1, { tweens: [tween('e1')] })])
    anim.setEffect('e1', 'blur')
    slide.value = slideOf(1)
    await vi.advanceTimersByTimeAsync(0)
    expect(api.putAnimation).toHaveBeenCalledTimes(1)
    const [, index, body] = api.putAnimation.mock.calls[0]!
    expect(index).toBe(0)
    expect(body.map((t: AnimationTween) => t.target)).toEqual(['e0', 'e1'])
    expect(anim.draft.value).toEqual([tween('e1')])
    expect(anim.dirty.value).toBe(false)
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    expect(api.putAnimation).toHaveBeenCalledTimes(1)
    expect(anim.draft.value).toEqual([tween('e1')])
  })

  it('makes edits no-ops on an unsupported slide', async () => {
    const { anim } = setup([entry(0, { status: 'unsupported', tweens: [], targets: [] })])
    anim.setEffect('e0', 'fade')
    anim.patchTween('e0', { delay: 1 })
    anim.applyPreset('cascade')
    await anim.generate()
    await anim.clear()
    await anim.save()
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    expect(anim.draft.value).toEqual([])
    expect(api.putAnimation).not.toHaveBeenCalled()
    expect(api.generateAnimations).not.toHaveBeenCalled()
    expect(api.deleteAnimation).not.toHaveBeenCalled()
  })

  it('makes edits no-ops on a slide with no animatable elements', async () => {
    const { anim } = setup([entry(0, { status: 'missing', tweens: [], targets: [] })])
    anim.applyPreset('cinematic')
    await anim.generate()
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    expect(api.putAnimation).not.toHaveBeenCalled()
    expect(api.generateAnimations).not.toHaveBeenCalled()
  })

  it("applyPreset('clear') saves an empty list with PUT", async () => {
    const { anim } = setup()
    anim.applyPreset('clear')
    expect(anim.draft.value).toEqual([])
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    expect(api.putAnimation).toHaveBeenCalledWith('p1', 0, [], { slide_id: 's0', targets_signature: 'sig' })
    expect(api.deleteAnimation).not.toHaveBeenCalled()
  })

  it('clear DELETEs, resets the draft and drops a pending save', async () => {
    const { anim } = setup()
    anim.setEffect('e1', 'fade')
    await anim.clear()
    expect(api.deleteAnimation).toHaveBeenCalledWith('p1', 0)
    expect(anim.draft.value).toEqual([])
    expect(anim.dirty.value).toBe(false)
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    expect(api.putAnimation).not.toHaveBeenCalled()
  })

  it('after a reorder the stale cache is matched by slide id and the edit PUTs to the current index', async () => {
    // Deck order is now s1, s0; the animations cache still holds the old order.
    qc.setQueryData(presentationKeys.one('p1'), { id: 'p1', slides: [slideOf(1, 0), slideOf(0, 1)] })
    slide.value = slideOf(1, 0)
    const { anim } = setup([entry(0, { tweens: [tween('e0')] }), entry(1, { tweens: [tween('e1')] })])
    await nextTick()
    expect(anim.animation.value?.slide_id).toBe('s1')
    expect(anim.draft.value).toEqual([tween('e1')])
    anim.setEffect('e0', 'fade')
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    expect(api.putAnimation).toHaveBeenCalledTimes(1)
    expect(api.putAnimation.mock.calls[0]![1]).toBe(0)
  })

  it('generate after a reorder asks for the slide at its current index', async () => {
    qc.setQueryData(presentationKeys.one('p1'), { id: 'p1', slides: [slideOf(1, 0), slideOf(0, 1)] })
    slide.value = slideOf(0, 1)
    api.generateAnimations.mockResolvedValue({ slides: [entry(0, { index: 1, tweens: [tween('e1')] })] })
    const { anim } = setup()
    await anim.generate()
    expect(api.generateAnimations).toHaveBeenCalledWith('p1', { slide_indexes: [1], force: false })
    expect(anim.draft.value).toEqual([tween('e1')])
  })

  it('generateAll flushes a dirty draft, then starts the async task', async () => {
    api.generateAnimationsAsync.mockResolvedValue({ id: 't1', status: 'pending' })
    const { anim } = setup()
    anim.setEffect('e1', 'fade')
    const task = await anim.generateAll()
    expect(api.putAnimation).toHaveBeenCalledTimes(1)
    expect(api.generateAnimationsAsync).toHaveBeenCalledWith('p1', {})
    expect(task).toMatchObject({ id: 't1' })
  })

  it('sends the slide id and the signature of the entry being edited', async () => {
    const { anim } = setup()
    anim.setEffect('e1', 'fade')
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    expect(api.putAnimation.mock.calls[0]![3]).toEqual({ slide_id: 's0', targets_signature: 'sig' })
  })

  it('never runs two PUTs at once and sends the newest snapshot last', async () => {
    let release!: (v: SlideAnimation) => void
    api.putAnimation.mockImplementationOnce(
      (_id: string, index: number, tweens: AnimationTween[]) =>
        new Promise<SlideAnimation>((resolve) => (release = () => resolve(entry(index, { tweens, source: 'user' })))),
    )
    const { anim } = setup()
    anim.setEffect('e1', 'fade')
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    expect(api.putAnimation).toHaveBeenCalledTimes(1)
    anim.patchTween('e1', { delay: 0.5 })
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    anim.patchTween('e1', { delay: 0.7 })
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    // The slow first PUT is still out: nothing else is sent.
    expect(api.putAnimation).toHaveBeenCalledTimes(1)
    release(entry(0))
    await vi.advanceTimersByTimeAsync(0)
    // The old response must not roll the draft back.
    expect(anim.draft.value.find((t) => t.target === 'e1')?.delay).toBe(0.7)
    expect(api.putAnimation).toHaveBeenCalledTimes(2)
    expect(api.putAnimation.mock.calls[1]![2].find((t: AnimationTween) => t.target === 'e1').delay).toBe(0.7)
    await vi.advanceTimersByTimeAsync(0)
    expect(anim.dirty.value).toBe(false)
    expect(anim.draft.value.find((t) => t.target === 'e1')?.delay).toBe(0.7)
    const cached = qc.getQueryData<{ slides: SlideAnimation[] }>(animationKeys.one('p1'))!.slides[0]!
    expect(cached.tweens.find((t) => t.target === 'e1')?.delay).toBe(0.7)
  })

  it('ignores a PUT response older than a generate result', async () => {
    let release!: () => void
    api.putAnimation.mockImplementationOnce(
      (_id: string, index: number, tweens: AnimationTween[]) =>
        new Promise<SlideAnimation>((resolve) => (release = () => resolve(entry(index, { tweens, source: 'user' })))),
    )
    api.generateAnimations.mockResolvedValue({ slides: [entry(0, { tweens: [tween('e1', { delay: 0.9 })] })] })
    const { anim } = setup()
    anim.setEffect('e1', 'fade')
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    const generating = anim.generate({ force: true })
    await vi.advanceTimersByTimeAsync(0)
    // generate waits for the PUT in flight before it asks for a plan.
    expect(api.generateAnimations).not.toHaveBeenCalled()
    release()
    await generating
    expect(api.generateAnimations).toHaveBeenCalledTimes(1)
    expect(anim.draft.value).toEqual([tween('e1', { delay: 0.9 })])
    expect(anim.animation.value?.tweens).toEqual([tween('e1', { delay: 0.9 })])
  })

  it('on a 409 keeps the draft unsaved, says so, and refetches the plan', async () => {
    api.putAnimation.mockRejectedValueOnce(new ApiError('changed', 409, { detail: 'changed' }))
    const { anim } = setup()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    anim.setEffect('e1', 'fade')
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    expect(anim.error.value).toBe('This slide changed — refreshing')
    expect(anim.dirty.value).toBe(true)
    expect(anim.draft.value.map((t) => t.target)).toEqual(['e0', 'e1'])
    expect(spy).toHaveBeenCalledWith({ queryKey: animationKeys.one('p1') })
    // Not retried with the stale signature.
    await anim.save()
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    expect(api.putAnimation).toHaveBeenCalledTimes(1)
  })

  it('a stale_layout plan is read-only but can be re-planned', async () => {
    api.generateAnimations.mockResolvedValue({ slides: [entry(0, { tweens: [tween('e1')] })] })
    const { anim } = setup([entry(0, { status: 'stale_layout' })])
    expect(anim.stale.value).toBe(true)
    anim.setEffect('e1', 'fade')
    anim.patchTween('e0', { delay: 1 })
    anim.applyPreset('cascade')
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    expect(api.putAnimation).not.toHaveBeenCalled()
    expect(anim.draft.value).toEqual([tween('e0')])
    await anim.generate({ force: true })
    expect(api.generateAnimations).toHaveBeenCalledWith('p1', { slide_indexes: [0], force: true })
    expect(anim.stale.value).toBe(false)
  })

  it('a draft targeting an element the slide no longer has is stale', async () => {
    const { anim } = setup([entry(0, { tweens: [tween('e5')] })])
    expect(anim.stale.value).toBe(true)
    anim.setEffect('e1', 'fade')
    await vi.advanceTimersByTimeAsync(ANIMATION_SAVE_DELAY_MS)
    expect(api.putAnimation).not.toHaveBeenCalled()
  })

  it('generate and clear wait for a pending deck-order save, then use the slide\'s new index', async () => {
    let finish!: () => void
    deckSave.settled.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)))
    api.generateAnimations.mockResolvedValue({ slides: [entry(0, { index: 1 })] })
    const { anim } = setup()
    const generating = anim.generate()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.generateAnimations).not.toHaveBeenCalled()
    // The reorder lands: s0 is second now.
    qc.setQueryData(presentationKeys.one('p1'), { id: 'p1', slides: [slideOf(1, 0), slideOf(0, 1)] })
    finish()
    await generating
    expect(api.generateAnimations).toHaveBeenCalledWith('p1', { slide_indexes: [1], force: false })
    expect(deckSave.settled).toHaveBeenCalledWith('p1')

    await anim.clear()
    expect(api.deleteAnimation).toHaveBeenCalledWith('p1', 1)
  })
})
