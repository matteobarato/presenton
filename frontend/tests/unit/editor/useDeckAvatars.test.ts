import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { animationKeys } from '@/api/animations'
import { useDeckAvatars, type DeckAvatars } from '@/components/editor/inspector/video/useDeckAvatars'

const m = vi.hoisted(() => ({
  getVideos: vi.fn(),
  getAvatarGeneration: vi.fn(),
  getAvatarPreview: vi.fn(),
  addPlaceholder: vi.fn(),
  removePlaceholder: vi.fn(),
  uploadSlideVideo: vi.fn(),
  failToast: vi.fn(),
}))
vi.mock('@/api/videos', async (orig) => ({
  ...(await orig<typeof import('@/api/videos')>()),
  getVideos: m.getVideos,
  getAvatarGeneration: m.getAvatarGeneration,
  getAvatarPreview: m.getAvatarPreview,
  addPlaceholder: m.addPlaceholder,
  removePlaceholder: m.removePlaceholder,
  uploadSlideVideo: m.uploadSlideVideo,
}))
vi.mock('@/components/editor/inspector/narration/useDeckNarration', async (orig) => ({
  ...(await orig<typeof import('@/components/editor/inspector/narration/useDeckNarration')>()),
  failToast: m.failToast,
}))

const slide = { id: 's0', index: 0, ui: {} } as never
const narration = { language: ref('en-US'), tts: ref(null), stateOf: () => 'none' } as never

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(queryClient, 'invalidateQueries')
  let avatars!: DeckAvatars
  mount(
    defineComponent({
      setup() {
        avatars = useDeckAvatars(ref('p1'), ref({ id: 'p1', slides: [slide] }) as never, narration)
        return () => h('div')
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  )
  const animationsInvalidated = () =>
    spy.mock.calls.some(([f]) => JSON.stringify((f as { queryKey?: unknown })?.queryKey) === JSON.stringify(animationKeys.one('p1')))
  return { avatars, animationsInvalidated }
}

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait: null, videos: [] })
  m.getAvatarGeneration.mockResolvedValue(null)
  m.getAvatarPreview.mockResolvedValue({ language: 'en-US', languages: ['en-US'], slides: [] })
})

describe('useDeckAvatars: motion data follows element changes', () => {
  const file = new File(['x'], 'v.mp4', { type: 'video/mp4' })
  const cases: [string, (a: DeckAvatars) => Promise<unknown>, keyof typeof m][] = [
    ['adding a placeholder', (a) => a.togglePlaceholder(slide, true), 'addPlaceholder'],
    ['removing a placeholder', (a) => a.togglePlaceholder(slide, false), 'removePlaceholder'],
    ['uploading a video', (a) => a.uploadVideo(slide, file), 'uploadSlideVideo'],
  ]

  it.each(cases)('refreshes animations after %s', async (_n, run, api) => {
    m[api].mockResolvedValue(undefined)
    const { avatars, animationsInvalidated } = setup()
    await flushPromises()
    await run(avatars)
    expect(animationsInvalidated()).toBe(true)
  })

  it.each(cases)('leaves animations alone when %s fails', async (_n, run, api) => {
    m[api].mockRejectedValue(new Error('boom'))
    const { avatars, animationsInvalidated } = setup()
    await flushPromises()
    await run(avatars)
    expect(animationsInvalidated()).toBe(false)
    expect(m.failToast).toHaveBeenCalled()
  })
})
