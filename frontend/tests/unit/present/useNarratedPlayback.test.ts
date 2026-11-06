import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref, type Ref } from 'vue'
import { QueryClient, useQuery, VueQueryPlugin } from '@tanstack/vue-query'
import { useNarratedPlayback } from '@/composables/useNarratedPlayback'

const m = vi.hoisted(() => ({ getPlayback: vi.fn() }))
vi.mock('@/api/playback', async (orig) => ({ ...(await orig<typeof import('@/api/playback')>()), getPlayback: m.getPlayback }))
vi.mock('@/api/tts', async (orig) => ({
  ...(await orig<typeof import('@/api/tts')>()),
  listTtsLanguages: async () => [
    { code: 'it-IT', name: 'Italian' },
    { code: 'en-US', name: 'English' },
  ],
}))
vi.mock('@/api/presentations', () => ({
  usePresentation: (id: Ref<string>) => useQuery({ queryKey: () => ['presentation', id.value], queryFn: async () => ({ id: id.value, language: 'en-US' }) }),
}))

class FakeAudio extends EventTarget {
  static last: FakeAudio
  src = ''
  play = vi.fn(() => Promise.resolve())
  pause = vi.fn()
  constructor() {
    super()
    FakeAudio.last = this
  }
}

const slideAudio = (i: number, url?: string) => ({
  slide_id: `s${i}`,
  slide_index: i,
  actor: url ? 'voice' : 'none',
  audio: url ? { url } : null,
})
const response = (slides: unknown[]) => ({ presentation_id: 'p1', slides })

function setup(index = ref(0), enabled = ref(false)) {
  let api!: ReturnType<typeof useNarratedPlayback>
  const advance = vi.fn(() => {
    index.value += 1
  })
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useNarratedPlayback(ref('p1'), index, enabled)
        api.onAdvance(advance)
        return () => h('div')
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  )
  return { api, index, enabled, advance, wrapper }
}
const setVisibility = (state: 'hidden' | 'visible') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.stubGlobal('Audio', FakeAudio)
  localStorage.clear()
  m.getPlayback.mockReset()
  m.getPlayback.mockResolvedValue(response([slideAudio(0, '/a/0.mp3'), slideAudio(1, 'http://backend:8000/a/1.mp3'), slideAudio(2)]))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setVisibility('visible')
})

describe('useNarratedPlayback', () => {
  it('asks for the deck narration language, falling back to the deck language', async () => {
    localStorage.setItem('presenton.tts.lang.p1', 'it-IT')
    setup()
    await flushPromises()
    expect(m.getPlayback).toHaveBeenCalledWith('p1', 'it-IT')
    m.getPlayback.mockClear()
    localStorage.clear()
    setup()
    await flushPromises()
    expect(m.getPlayback).toHaveBeenCalledWith('p1', 'en-US')
  })

  it('plays slide 0 when switched on and advances on ended', async () => {
    const { api, enabled, advance, index } = setup()
    await flushPromises()
    expect(FakeAudio.last.play).not.toHaveBeenCalled()
    enabled.value = true
    await flushPromises()
    expect(FakeAudio.last.src).toBe('/a/0.mp3')
    expect(FakeAudio.last.play).toHaveBeenCalledTimes(1)
    expect(api.playing.value).toBe(true)
    FakeAudio.last.dispatchEvent(new Event('ended'))
    await flushPromises()
    expect(advance).toHaveBeenCalledTimes(1)
    expect(index.value).toBe(1)
    // absolute backend URLs play through the proxy
    expect(FakeAudio.last.src).toBe('/a/1.mp3')
    expect(FakeAudio.last.play).toHaveBeenCalledTimes(2)
  })

  it('advances a slide without audio after 1500 ms', async () => {
    const { advance, enabled } = setup(ref(2), ref(false))
    await flushPromises()
    vi.useFakeTimers()
    enabled.value = true
    await flushPromises()
    vi.advanceTimersByTime(1499)
    expect(advance).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(advance).toHaveBeenCalledTimes(1)
    expect(FakeAudio.last.play).not.toHaveBeenCalled()
  })

  it('pauses while the document is hidden and resumes when visible again', async () => {
    const { api, enabled } = setup()
    enabled.value = true
    await flushPromises()
    setVisibility('hidden')
    expect(FakeAudio.last.pause).toHaveBeenCalled()
    expect(api.playing.value).toBe(false)
    setVisibility('visible')
    expect(FakeAudio.last.play).toHaveBeenCalledTimes(2)
    expect(api.playing.value).toBe(true)
  })

  it('does not resume on visible when it was paused by the user', async () => {
    const { api, enabled } = setup()
    enabled.value = true
    await flushPromises()
    api.toggle()
    FakeAudio.last.play.mockClear()
    setVisibility('hidden')
    setVisibility('visible')
    expect(FakeAudio.last.play).not.toHaveBeenCalled()
  })

  it('ignores a stale play() rejection after navigating to another slide', async () => {
    const { api, enabled, index } = setup()
    await flushPromises()
    let rejectFirst!: (e: Error) => void
    const first = new Promise<void>((_, reject) => {
      rejectFirst = reject
    })
    FakeAudio.last.play.mockReturnValueOnce(first)
    enabled.value = true
    await flushPromises()
    index.value = 1
    await flushPromises()
    expect(api.playing.value).toBe(true)
    const abort = new Error('interrupted')
    abort.name = 'AbortError'
    rejectFirst(abort)
    await flushPromises()
    expect(api.playing.value).toBe(true)
  })

  it('pauses when narration is turned off', async () => {
    const { api, enabled } = setup()
    enabled.value = true
    await flushPromises()
    enabled.value = false
    await flushPromises()
    expect(FakeAudio.last.pause).toHaveBeenCalled()
    expect(api.playing.value).toBe(false)
    expect(api.avatar.value).toBeNull()
  })

  it('toggle pauses and resumes', async () => {
    const { api, enabled } = setup()
    enabled.value = true
    await flushPromises()
    api.toggle()
    expect(api.playing.value).toBe(false)
    api.toggle()
    expect(api.playing.value).toBe(true)
    expect(FakeAudio.last.src).toBe('/a/0.mp3')
  })

  it('exposes the avatar video and its placeholder rect for video slides', async () => {
    m.getPlayback.mockResolvedValue(
      response([
        {
          ...slideAudio(0, '/a/0.mp3'),
          actor: 'video',
          video: { url: 'http://backend:8000/v/0.mp4' },
          placeholder: { position: { x: 640, y: 360 }, size: { width: 320, height: 180 } },
        },
      ]),
    )
    const { api, enabled } = setup()
    await flushPromises()
    enabled.value = true
    await flushPromises()
    expect(api.avatar.value).toEqual({ src: '/v/0.mp4', rect: { x: 640, y: 360, width: 320, height: 180 } })
  })

  it('reports narration unavailable when no slide has audio or the request fails', async () => {
    m.getPlayback.mockResolvedValue(response([slideAudio(0), slideAudio(1)]))
    const none = setup()
    await flushPromises()
    expect(none.api.available.value).toBe(false)
    m.getPlayback.mockRejectedValue(new Error('boom'))
    const failed = setup()
    await flushPromises()
    expect(failed.api.available.value).toBe(false)
  })
})
