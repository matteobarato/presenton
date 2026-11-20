import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { QueryClient, useQuery, VueQueryPlugin } from '@tanstack/vue-query'
import type { Ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ApiError } from '@/api/errors'
import CreateDeckView from '@/views/CreateDeckView.vue'

const m = vi.hoisted(() => ({
  getPresentation: vi.fn(),
  listTtsLanguages: vi.fn(),
  getTtsStatus: vi.fn(),
  getVideos: vi.fn(),
  getAvatarGeneration: vi.fn(),
  getAvatarPreview: vi.fn(),
  listTemplates: vi.fn(),
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}))
// The hooks call their fetchers inside their own module, so the hooks themselves are swapped for
// ones that read the mocks under the real query keys.
vi.mock('@/api/presentations', async (orig) => {
  const real = await orig<typeof import('@/api/presentations')>()
  return {
    ...real,
    usePresentation: (id: Ref<string>) =>
      useQuery({ queryKey: () => real.presentationKeys.one(id.value), queryFn: () => m.getPresentation(id.value) }),
  }
})
vi.mock('@/api/tts', async (orig) => {
  const real = await orig<typeof import('@/api/tts')>()
  return {
    ...real,
    listTtsLanguages: m.listTtsLanguages,
    useTts: (id: Ref<string>, language: Ref<string>) =>
      useQuery({
        queryKey: () => real.ttsKeys.status(id.value, language.value),
        queryFn: () => m.getTtsStatus(id.value, language.value),
        enabled: () => Boolean(id.value && language.value),
      }),
  }
})
vi.mock('@/api/videos', async (orig) => ({
  ...(await orig<typeof import('@/api/videos')>()),
  getVideos: m.getVideos,
  getAvatarGeneration: m.getAvatarGeneration,
  getAvatarPreview: m.getAvatarPreview,
}))
vi.mock('@/api/templates', async (orig) => ({
  ...(await orig<typeof import('@/api/templates')>()),
  listTemplates: m.listTemplates,
}))
vi.mock('@/components/ui/sonner', () => ({ toast: m.toast }))

const slide = (i: number, placeholder: boolean) => ({
  id: `s${i}`,
  index: i,
  layout_group: 'modern',
  layout: 'l1',
  speaker_note: `Note ${i}`,
  content: {},
  ui: placeholder ? { layers: [{ video_placeholder: true }] } : {},
})

function deck(placeholders: boolean) {
  return {
    id: 'p1',
    content: 'Why octopuses are smarter than you think',
    n_slides: 3,
    language: 'English',
    tone: 'casual',
    verbosity: 'concise',
    generation_mode: 'standard',
    slides: [0, 1, 2].map((i) => slide(i, placeholders)),
  }
}

const audios = (n: number) => Array.from({ length: n }, (_, i) => ({ slide_id: `s${i}`, slide_index: i, text: `Note ${i}` }))
const videos = (n: number) => Array.from({ length: n }, (_, i) => ({ slide_id: `s${i}`, slide_index: i, url: `/v${i}.mp4` }))

async function mountView(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/p/:id/create/:step?', name: 'create', component: CreateDeckView },
      { path: '/p/:id', name: 'editor', component: { template: '<div />' } },
      { path: '/', name: 'library', component: { template: '<div />' } },
      { path: '/new', name: 'new', component: { template: '<div />' } },
    ],
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await router.push(path)
  await router.isReady()
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router, [VueQueryPlugin, { queryClient }]] } })
  await flushPromises()
  await flushPromises()
  return { wrapper, router }
}

enableAutoUnmount(afterEach)

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  sessionStorage.clear()
  Object.values(m).forEach((f) => typeof f === 'function' && f.mockReset())
  Object.values(m.toast).forEach((f) => f.mockReset())
  m.getPresentation.mockResolvedValue(deck(false))
  m.listTtsLanguages.mockResolvedValue([{ code: 'en-US', name: 'English' }])
  m.getTtsStatus.mockResolvedValue({ presentation_id: 'p1', language: 'en-US', audios: [] })
  m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait: null, videos: [] })
  m.getAvatarGeneration.mockResolvedValue(null)
  m.getAvatarPreview.mockResolvedValue({ language: 'en-US', languages: ['en-US'], slides: [] })
  m.listTemplates.mockResolvedValue([{ id: 'modern', name: 'Modern', layouts: [], kind: 'builtin' }])
})

const panel = (key: string) => `section[data-testid="step-${key}"]`

describe('CreateDeckView', () => {
  it('missing step resumes', async () => {
    const { wrapper, router } = await mountView('/p/p1/create')
    // Slides exist, no narration yet: the first step not done is Avatar.
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/avatar')
    expect(wrapper.find(panel('avatar')).exists()).toBe(true)
    expect(m.toast.info).not.toHaveBeenCalled()
  })

  it('unknown step resumes', async () => {
    const { router } = await mountView('/p/p1/create/bogus')
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/avatar')
  })

  it('a deck without slides resumes on the outline', async () => {
    m.getPresentation.mockResolvedValue({ ...deck(false), slides: [] })
    const { wrapper, router } = await mountView('/p/p1/create')
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/outline')
    expect(wrapper.find(panel('outline')).exists()).toBe(true)
  })

  it('locked step redirects to resume step', async () => {
    m.getPresentation.mockResolvedValue(deck(true))
    const { wrapper, router } = await mountView('/p/p1/create/export')
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/avatar')
    expect(m.toast.info).toHaveBeenCalledWith('3 slides still need their avatar')
    expect(wrapper.find(panel('export')).exists()).toBe(false)
    expect(wrapper.find(panel('avatar')).exists()).toBe(true)
  })

  it('waits for narration and videos before judging a step locked', async () => {
    m.getPresentation.mockResolvedValue(deck(true))
    m.getTtsStatus.mockResolvedValue({ presentation_id: 'p1', language: 'en-US', audios: audios(3) })
    m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait: null, videos: videos(3) })
    const { wrapper, router } = await mountView('/p/p1/create/export')
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/export')
    expect(m.toast.info).not.toHaveBeenCalled()
    expect(wrapper.find(panel('export')).exists()).toBe(true)
  })

  it('read-only summary for topic', async () => {
    const { wrapper, router } = await mountView('/p/p1/create/avatar')
    expect(wrapper.find('[data-testid="step-topic"]').text()).toContain('Why octopuses')
    expect(wrapper.find('[data-testid="step-look"]').text()).toContain('Modern')
    expect(wrapper.find('[data-testid="step-details"]').text()).toContain('3 slides · casual · concise')

    await wrapper.get('[data-testid="step-topic"]').trigger('click')
    await flushPromises()
    const summary = wrapper.get('[data-testid="summary-topic"]')
    expect(summary.text()).toContain('Why octopuses are smarter than you think')
    expect(summary.find('textarea, input').exists()).toBe(false)
    expect(wrapper.find(panel('avatar')).exists()).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/avatar')

    // Picking a deck step leaves the summary.
    await wrapper.get('[data-testid="step-preview"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/preview')
    expect(wrapper.find('[data-testid="summary-topic"]').exists()).toBe(false)
    expect(wrapper.find(panel('preview')).exists()).toBe(true)
  })

  it('Alt+arrows move between unlocked deck steps', async () => {
    const { router } = await mountView('/p/p1/create/avatar')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true }))
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/preview')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true }))
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/avatar')
    // Export is available (no placeholders → avatar optional).
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true }))
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/export')
  })

  it('not found shows message', async () => {
    m.getPresentation.mockRejectedValue(new ApiError('Not found', 404))
    const { wrapper } = await mountView('/p/p1/create/outline')
    expect(wrapper.text()).toContain('Presentation not found')
  })
})
