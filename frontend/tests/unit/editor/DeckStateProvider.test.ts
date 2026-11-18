/* eslint-disable vue/one-component-per-file -- tiny inline consumers are the point of this test */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import DeckStateProvider from '@/components/editor/DeckStateProvider.vue'
import { injectDeckNarration, type DeckNarration } from '@/components/editor/inspector/narration/useDeckNarration'
import { injectDeckAvatars, type DeckAvatars } from '@/components/editor/inspector/video/useDeckAvatars'

const m = vi.hoisted(() => ({
  listTtsLanguages: vi.fn(),
  getTtsStatus: vi.fn(),
  getVideos: vi.fn(),
  getAvatarGeneration: vi.fn(),
  getAvatarPreview: vi.fn(),
}))
vi.mock('@/api/tts', async (orig) => ({
  ...(await orig<typeof import('@/api/tts')>()),
  listTtsLanguages: m.listTtsLanguages,
  getTtsStatus: m.getTtsStatus,
}))
vi.mock('@/api/videos', async (orig) => ({
  ...(await orig<typeof import('@/api/videos')>()),
  getVideos: m.getVideos,
  getAvatarGeneration: m.getAvatarGeneration,
  getAvatarPreview: m.getAvatarPreview,
}))

const presentation = { id: 'p1', slides: [{ id: 's0', index: 0, speaker_note: 'Hi', ui: {} }] }

beforeEach(() => {
  setActivePinia(createPinia())
  Object.values(m).forEach((f) => f.mockReset())
  localStorage.clear()
  m.listTtsLanguages.mockResolvedValue([{ code: 'en-US', name: 'English' }])
  m.getTtsStatus.mockResolvedValue({ presentation_id: 'p1', language: 'en-US', audios: [] })
  m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait: null, videos: [] })
  m.getAvatarGeneration.mockResolvedValue(null)
  m.getAvatarPreview.mockResolvedValue({ language: 'en-US', languages: ['en-US'], slides: [] })
})

function consumer(sink: { narration?: DeckNarration; avatars?: DeckAvatars }) {
  return defineComponent({
    setup() {
      sink.narration = injectDeckNarration()
      sink.avatars = injectDeckAvatars()
      return () => h('div')
    },
  })
}

describe('DeckStateProvider', () => {
  it('gives every consumer below it the same narration and avatar state', async () => {
    const a: { narration?: DeckNarration; avatars?: DeckAvatars } = {}
    const b: { narration?: DeckNarration; avatars?: DeckAvatars } = {}
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mount(
      defineComponent({
        setup: () => () =>
          h(DeckStateProvider, { presentationId: 'p1', presentation: presentation as never }, () => [h(consumer(a)), h('section', [h(consumer(b))])]),
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
    )
    await flushPromises()
    expect(a.narration).toBeDefined()
    expect(a.narration).toBe(b.narration)
    expect(a.avatars).toBe(b.avatars)
  })

  it('throws for a consumer without a provider', () => {
    const queryClient = new QueryClient()
    expect(() => mount(consumer({}), { global: { plugins: [[VueQueryPlugin, { queryClient }]] } })).toThrow('useDeckNarration was not provided')
  })
})
