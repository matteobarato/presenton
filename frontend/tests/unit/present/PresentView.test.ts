import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Ref } from 'vue'
import { QueryClient, useQuery, VueQueryPlugin } from '@tanstack/vue-query'
import { createMemoryHistory, createRouter } from 'vue-router'
import PresentView from '@/views/PresentView.vue'

const m = vi.hoisted(() => ({ getPlayback: vi.fn(), getPresentation: vi.fn() }))
vi.mock('@/api/playback', async (orig) => ({ ...(await orig<typeof import('@/api/playback')>()), getPlayback: m.getPlayback }))
vi.mock('@/api/presentations', () => ({
  usePresentation: (id: Ref<string>) => useQuery({ queryKey: () => ['presentation', id.value], queryFn: () => m.getPresentation(id.value) }),
}))
vi.mock('@/api/tts', async (orig) => ({
  ...(await orig<typeof import('@/api/tts')>()),
  listTtsLanguages: async () => [
    { code: 'it-IT', name: 'Italian' },
    { code: 'en-US', name: 'English' },
  ],
}))
vi.mock('@/render/SlideView.vue', () => ({
  default: { props: ['slide', 'scale'], template: '<div data-testid="slide-view" :data-slide="slide.id" :data-scale="scale" />' },
}))

class FakeAudio extends EventTarget {
  static last: FakeAudio
  constructor() {
    super()
    FakeAudio.last = this
  }
  src = ''
  play = vi.fn(() => Promise.resolve())
  pause = vi.fn()
}

const deck = (n: number) => ({
  id: 'p1',
  language: 'en-US',
  theme: null,
  slides: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, index: i, ui: {} })),
})
const playbackSlide = (i: number, extra: object = {}) => ({ slide_id: `s${i}`, slide_index: i, actor: 'voice', audio: { url: `/a/${i}.mp3` }, ...extra })

async function mountView(slides = 12, query = '') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/p/:id', name: 'editor', component: { template: '<div />' } },
      { path: '/p/:id/present', name: 'present', component: PresentView },
    ],
  })
  await router.push(`/p/p1/present${query}`)
  m.getPresentation.mockResolvedValue(deck(slides))
  const wrapper = mount(PresentView, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}
const counter = (w: ReturnType<typeof mount>) => w.get('[data-testid="counter"]').text()
const key = async (k: string) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
  await flushPromises()
}
const button = (w: ReturnType<typeof mount>, label: string) => w.find(`button[aria-label="${label}"]`)

beforeEach(() => {
  vi.stubGlobal('Audio', FakeAudio)
  localStorage.clear()
  m.getPlayback.mockReset()
  m.getPlayback.mockResolvedValue({ presentation_id: 'p1', slides: [playbackSlide(0)] })
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('PresentView', () => {
  it('shows the counter and navigates with the keyboard', async () => {
    const { wrapper } = await mountView()
    expect(counter(wrapper)).toBe('1 / 12')
    await key('ArrowRight')
    await key(' ')
    expect(counter(wrapper)).toBe('3 / 12')
    expect(wrapper.get('[data-testid="slide-view"]').attributes('data-slide')).toBe('s2')
    await key('ArrowLeft')
    expect(counter(wrapper)).toBe('2 / 12')
    wrapper.unmount()
  })

  it('goes next on click but not when clicking the controls', async () => {
    const { wrapper } = await mountView()
    await wrapper.get('[data-testid="present"]').trigger('click')
    expect(counter(wrapper)).toBe('2 / 12')
    await button(wrapper, 'Previous slide').trigger('click')
    expect(counter(wrapper)).toBe('1 / 12')
    wrapper.unmount()
  })

  it('stays within the deck', async () => {
    const { wrapper } = await mountView(2)
    await key('ArrowLeft')
    expect(counter(wrapper)).toBe('1 / 2')
    await key('ArrowRight')
    await key('ArrowRight')
    expect(counter(wrapper)).toBe('2 / 2')
    wrapper.unmount()
  })

  it('Esc returns to the editor', async () => {
    const { wrapper, router } = await mountView()
    await key('Escape')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1')
    wrapper.unmount()
  })

  it('uses the opacity-only transition under reduced motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
    const reduced = await mountView()
    expect(reduced.wrapper.get('[data-present-stage]').attributes('data-transition')).toBe('present-fade')
    reduced.wrapper.unmount()
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const full = await mountView()
    expect(full.wrapper.get('[data-present-stage]').attributes('data-transition')).toBe('present-change')
    full.wrapper.unmount()
  })

  it('draws a muted avatar video positioned from the placeholder rect scaled to the stage', async () => {
    m.getPlayback.mockResolvedValue({
      presentation_id: 'p1',
      slides: [
        playbackSlide(0, {
          actor: 'video',
          video: { url: 'http://backend:8000/v/0.mp4' },
          placeholder: { position: { x: 640, y: 360 }, size: { width: 320, height: 180 } },
        }),
      ],
    })
    // jsdom has no layout, so the stage falls back to the window size: 1024x768 gives scale 0.8.
    const { wrapper } = await mountView()
    expect(wrapper.find('video').exists()).toBe(false)
    await button(wrapper, 'Turn narration on').trigger('click')
    await flushPromises()
    const video = wrapper.get('video')
    expect((video.element as HTMLVideoElement).muted).toBe(true)
    expect(video.attributes('src')).toBe('/v/0.mp4')
    expect(wrapper.get('[data-testid="slide-view"]').attributes('data-scale')).toBe('0.8')
    expect(video.attributes('style')).toContain('left: 512px')
    expect(video.attributes('style')).toContain('top: 288px')
    expect(video.attributes('style')).toContain('width: 256px')
    expect(video.attributes('style')).toContain('height: 144px')
    wrapper.unmount()
  })

  it('offers the narration toggle only when some slide has audio', async () => {
    const withAudio = await mountView()
    expect(button(withAudio.wrapper, 'Turn narration on').exists()).toBe(true)
    withAudio.wrapper.unmount()

    m.getPlayback.mockResolvedValue({ presentation_id: 'p1', slides: [{ slide_id: 's0', slide_index: 0, actor: 'none', audio: null }] })
    const silent = await mountView()
    expect(button(silent.wrapper, 'Turn narration on').exists()).toBe(false)
    silent.wrapper.unmount()

    m.getPlayback.mockRejectedValue(new Error('boom'))
    const failed = await mountView()
    expect(button(failed.wrapper, 'Turn narration on').exists()).toBe(false)
    expect(counter(failed.wrapper)).toBe('1 / 12')
    failed.wrapper.unmount()
  })

  it('moves to the next slide when narration ends', async () => {
    m.getPlayback.mockResolvedValue({ presentation_id: 'p1', slides: [playbackSlide(0), playbackSlide(1)] })
    const { wrapper } = await mountView(2)
    await button(wrapper, 'Turn narration on').trigger('click')
    await flushPromises()
    expect(counter(wrapper)).toBe('1 / 2')
    FakeAudio.last.dispatchEvent(new Event('ended'))
    await flushPromises()
    expect(counter(wrapper)).toBe('2 / 2')
    // the last slide ending stops narration instead of running past the deck
    FakeAudio.last.dispatchEvent(new Event('ended'))
    await flushPromises()
    expect(counter(wrapper)).toBe('2 / 2')
    expect(button(wrapper, 'Turn narration on').exists()).toBe(true)
    wrapper.unmount()
  })

  it('hides the controls after 2 s without pointer movement', async () => {
    vi.useFakeTimers()
    const { wrapper } = await mountView()
    const controls = wrapper.get('[data-present-controls]')
    expect(controls.classes()).toContain('opacity-100')
    vi.advanceTimersByTime(2000)
    await flushPromises()
    expect(controls.classes()).toContain('opacity-0')
    await wrapper.get('[data-testid="present"]').trigger('mousemove')
    expect(controls.classes()).toContain('opacity-100')
    vi.useRealTimers()
    wrapper.unmount()
  })
})
