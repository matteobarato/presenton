import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import BubblePlacer from '@/components/editor/inspector/video/BubblePlacer.vue'

const m = vi.hoisted(() => ({ getPlayback: vi.fn(), updateBubble: vi.fn() }))
vi.mock('@/api/playback', async (orig) => ({
  ...(await orig<typeof import('@/api/playback')>()),
  getPlayback: m.getPlayback,
  updateBubble: m.updateBubble,
}))

async function mountPlacer(bubble = { x: 100, y: 100, width: 200, height: 200 }, language?: string) {
  m.getPlayback.mockResolvedValue({
    bubble: { position: { x: bubble.x, y: bubble.y }, size: { width: bubble.width, height: bubble.height }, is_default: false },
    slides: [],
  })
  const wrapper = mount(BubblePlacer, {
    props: { presentationId: 'p1', slide: { id: 's0', index: 0 } as never, language },
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] },
    attachTo: document.body,
  })
  // The overlay is 640px wide on screen: scale 0.5.
  vi.spyOn(wrapper.get('[data-testid="bubble-overlay"]').element, 'getBoundingClientRect').mockReturnValue({ width: 640, height: 360 } as DOMRect)
  await flushPromises()
  return wrapper
}
const ptr = (clientX: number, clientY: number) => ({ clientX, clientY })
/** jsdom has no PointerEvent: a MouseEvent with the same coordinates drives the handlers. */
async function fire(w: { element: Element }, type: string, init: { clientX: number; clientY: number }) {
  w.element.dispatchEvent(new MouseEvent(type, { ...init, bubbles: true }))
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  m.getPlayback.mockReset()
  m.updateBubble.mockReset().mockResolvedValue({})
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('BubblePlacer', () => {
  it('requests playback in the narration language', async () => {
    await mountPlacer(undefined, 'it-IT')
    expect(m.getPlayback).toHaveBeenCalledWith('p1', 'it-IT')
  })

  it('shows an inline error when playback cannot load', async () => {
    m.getPlayback.mockRejectedValue(new Error('409'))
    const w = mount(BubblePlacer, {
      props: { presentationId: 'p1', slide: { id: 's0', index: 0 } as never, language: 'en-US' },
      global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] },
    })
    await flushPromises()
    expect(w.get('[role="alert"]').text()).toBe("Couldn't load the voice bubble")
    expect(w.find('[data-testid="bubble"]').exists()).toBe(false)
  })

  it('saves a drag in slide units, debounced by 500 ms', async () => {
    const w = await mountPlacer()
    const bubble = w.get('[data-testid="bubble"]')
    await fire(bubble, 'pointerdown', ptr(0, 0))
    await fire(bubble, 'pointermove', ptr(64, 36))
    await fire(bubble, 'pointerup', ptr(64, 36))
    await vi.advanceTimersByTimeAsync(499)
    expect(m.updateBubble).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(m.updateBubble).toHaveBeenCalledTimes(1)
    expect(m.updateBubble).toHaveBeenCalledWith('p1', { x: 228, y: 172, width: 200, height: 200 })
  })

  it('collapses a burst of moves into one save', async () => {
    const w = await mountPlacer()
    const bubble = w.get('[data-testid="bubble"]')
    await fire(bubble, 'pointerdown', ptr(0, 0))
    for (const x of [10, 20, 30]) {
      await fire(bubble, 'pointermove', ptr(x, 0))
      await vi.advanceTimersByTimeAsync(200)
    }
    await vi.advanceTimersByTimeAsync(600)
    expect(m.updateBubble).toHaveBeenCalledTimes(1)
    expect(m.updateBubble).toHaveBeenCalledWith('p1', { x: 160, y: 100, width: 200, height: 200 })
  })

  it('keeps the bubble inside the stage when dragged out', async () => {
    const w = await mountPlacer()
    const bubble = w.get('[data-testid="bubble"]')
    await fire(bubble, 'pointerdown', ptr(0, 0))
    await fire(bubble, 'pointermove', ptr(5000, 5000))
    await vi.advanceTimersByTimeAsync(600)
    expect(m.updateBubble).toHaveBeenCalledWith('p1', { x: 1080, y: 520, width: 200, height: 200 })
  })

  it('resizes within the stage and never below 80x80', async () => {
    const w = await mountPlacer({ x: 1000, y: 500, width: 200, height: 200 })
    const handle = w.get('[data-testid="bubble-resize"]')
    await fire(handle, 'pointerdown', ptr(0, 0))
    await fire(handle, 'pointermove', ptr(500, 500))
    await vi.advanceTimersByTimeAsync(600)
    expect(m.updateBubble).toHaveBeenLastCalledWith('p1', { x: 1000, y: 500, width: 280, height: 220 })

    await fire(handle, 'pointermove', ptr(-900, -900))
    await vi.advanceTimersByTimeAsync(600)
    expect(m.updateBubble).toHaveBeenLastCalledWith('p1', { x: 1000, y: 500, width: 80, height: 80 })
  })

  it('moves with the arrow keys by 8 units, Shift by 40', async () => {
    const w = await mountPlacer()
    const bubble = w.get('[data-testid="bubble"]')
    await bubble.trigger('keydown', { key: 'ArrowRight' })
    await bubble.trigger('keydown', { key: 'ArrowDown' })
    await vi.advanceTimersByTimeAsync(600)
    expect(m.updateBubble).toHaveBeenLastCalledWith('p1', { x: 108, y: 108, width: 200, height: 200 })
    await bubble.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    await vi.advanceTimersByTimeAsync(600)
    expect(m.updateBubble).toHaveBeenLastCalledWith('p1', { x: 68, y: 108, width: 200, height: 200 })
  })
})
