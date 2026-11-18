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
vi.mock('@/api/animations', () => api)

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
  ...over,
})

const slideOf = (index: number) => ({ id: `s${index}`, index, content: {}, layout: 'x:a' }) as unknown as Slide

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
    expect(api.putAnimation).toHaveBeenCalledWith('p1', 0, [])
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

  it('generateAll flushes a dirty draft, then starts the async task', async () => {
    api.generateAnimationsAsync.mockResolvedValue({ id: 't1', status: 'pending' })
    const { anim } = setup()
    anim.setEffect('e1', 'fade')
    const task = await anim.generateAll()
    expect(api.putAnimation).toHaveBeenCalledTimes(1)
    expect(api.generateAnimationsAsync).toHaveBeenCalledWith('p1', {})
    expect(task).toMatchObject({ id: 't1' })
  })
})
