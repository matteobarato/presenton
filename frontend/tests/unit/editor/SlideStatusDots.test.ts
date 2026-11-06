import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Ref } from 'vue'
import { createPinia } from 'pinia'
import { QueryClient, useQuery, VueQueryPlugin } from '@tanstack/vue-query'
import SlideStatusDots from '@/components/editor/SlideStatusDots.vue'

const m = vi.hoisted(() => ({ getVideos: vi.fn(), getTtsStatus: vi.fn(), getPresentation: vi.fn() }))
vi.mock('@/api/videos', async (orig) => ({ ...(await orig<typeof import('@/api/videos')>()), getVideos: m.getVideos }))
vi.mock('@/api/presentations', async (orig) => ({
  ...(await orig<typeof import('@/api/presentations')>()),
  // usePresentation calls the module-internal getPresentation, so rebuild it on the mock.
  usePresentation: (id: Ref<string>) =>
    useQuery({ queryKey: () => ['presentation', id.value], queryFn: () => m.getPresentation(id.value) }),
}))
vi.mock('@/api/tts', async (orig) => ({
  ...(await orig<typeof import('@/api/tts')>()),
  useTts: (id: Ref<string>, lang: Ref<string>) =>
    useQuery({
      queryKey: () => ['tts', id.value, lang.value],
      queryFn: () => m.getTtsStatus(id.value, lang.value),
      enabled: () => Boolean(id.value && lang.value),
    }),
}))

const placeholderUi = { components: [{ elements: [{ type: 'image', video_placeholder: true }] }] }
const slide = (index: number, note: string, ui: unknown = {}) => ({ id: `s${index}`, index, speaker_note: note, ui })
const audio = (index: number, text: string) => ({ slide_index: index, slide_id: `s${index}`, text, url: `/a/${index}.mp3`, duration_seconds: 2 })
const presentation = {
  id: 'p1',
  slides: [slide(0, 'Hello', placeholderUi), slide(1, 'Edited note', placeholderUi), slide(2, 'Plain')],
}
const portrait = { url: '/app_data/portrait.png', mime_type: 'image/png', width: 10, height: 10, size_bytes: 1, updated_at: '' }

let queryClient: QueryClient

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  localStorage.clear()
  localStorage.setItem('presenton.tts.lang', 'en-US')
  m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait, videos: [] })
  m.getTtsStatus.mockResolvedValue({ presentation_id: 'p1', language: 'en-US', audios: [audio(0, 'Hello'), audio(1, 'Old note')] })
  m.getPresentation.mockResolvedValue(presentation)
})

describe('SlideStatusDots', () => {
  async function mountDots(slideIndex: number) {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = mount(SlideStatusDots, {
      props: { presentationId: 'p1', slideIndex },
      global: { plugins: [createPinia(), [VueQueryPlugin, { queryClient }]] },
    })
    await flushPromises()
    await flushPromises()
    return wrapper
  }

  it('shows a stale narration dot', async () => {
    const w = await mountDots(1)
    await vi.waitFor(() => expect(w.find('[aria-label="Narration out of date"]').exists()).toBe(true))
  })

  it('shows ready narration and an avatar dot', async () => {
    m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait, videos: [{ slide_index: 0 }] })
    const w = await mountDots(0)
    await vi.waitFor(() => expect(w.find('[aria-label="Narration ready"]').exists()).toBe(true))
    await vi.waitFor(() => expect(w.find('[aria-label="Avatar video"]').exists()).toBe(true))
  })

  it('shows nothing for a slide without narration or video', async () => {
    const w = await mountDots(2)
    expect(w.findAll('[role="img"]')).toHaveLength(0)
  })
})
