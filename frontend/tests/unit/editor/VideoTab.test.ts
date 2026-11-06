import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Ref } from 'vue'
import { createPinia } from 'pinia'
import { QueryClient, useQuery, VueQueryPlugin } from '@tanstack/vue-query'
import { ApiError } from '@/api/errors'
import VideoTab from '@/components/editor/inspector/VideoTab.vue'
import SlideStatusDots from '@/components/editor/SlideStatusDots.vue'

const m = vi.hoisted(() => ({
  getVideos: vi.fn(),
  getAvatarGeneration: vi.fn(),
  getAvatarPreview: vi.fn(),
  uploadPortrait: vi.fn(),
  deletePortrait: vi.fn(),
  addPlaceholder: vi.fn(),
  removePlaceholder: vi.fn(),
  uploadSlideVideo: vi.fn(),
  deleteSlideVideo: vi.fn(),
  startAvatarGeneration: vi.fn(),
  getTtsStatus: vi.fn(),
  getPresentation: vi.fn(),
  getPlayback: vi.fn(),
  getTask: vi.fn(),
}))
vi.mock('@/api/videos', async (orig) => ({ ...(await orig<typeof import('@/api/videos')>()), ...pick(m) }))
vi.mock('@/api/playback', async (orig) => ({ ...(await orig<typeof import('@/api/playback')>()), getPlayback: m.getPlayback }))
vi.mock('@/api/tasks', () => ({ getTask: m.getTask }))
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
vi.mock('@/render/SlideView.vue', () => ({ default: { template: '<div data-testid="slide-view" />' } }))

function pick(src: typeof m) {
  const keys = [
    'getVideos',
    'getAvatarGeneration',
    'getAvatarPreview',
    'uploadPortrait',
    'deletePortrait',
    'addPlaceholder',
    'removePlaceholder',
    'uploadSlideVideo',
    'deleteSlideVideo',
    'startAvatarGeneration',
  ] as const
  return Object.fromEntries(keys.map((k) => [k, src[k]]))
}

const placeholderUi = { components: [{ elements: [{ type: 'image', video_placeholder: true }] }] }
const slide = (index: number, note: string, ui: unknown = {}) => ({ id: `s${index}`, index, speaker_note: note, ui })
const audio = (index: number, text: string) => ({ slide_index: index, slide_id: `s${index}`, text, url: `/a/${index}.mp3`, duration_seconds: 2 })
const presentation = {
  id: 'p1',
  slides: [slide(0, 'Hello', placeholderUi), slide(1, 'Edited note', placeholderUi), slide(2, 'Plain')],
}
const portrait = { url: '/app_data/portrait.png', mime_type: 'image/png', width: 10, height: 10, size_bytes: 1, updated_at: '' }

let queryClient: QueryClient
async function mountTab() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  const wrapper = mount(VideoTab, {
    props: { presentationId: 'p1', presentation: presentation as never, activeSlide: presentation.slides[0] as never },
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    attachTo: document.body,
  })
  await flushPromises()
  await flushPromises()
  return { wrapper, invalidate }
}
const button = (w: ReturnType<typeof mount>, text: string) => w.findAll('button').find((b) => b.text().includes(text))!
const rows = (w: ReturnType<typeof mount>) => w.findAll('ul[aria-label="Slide videos"] > li')

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  localStorage.clear()
  sessionStorage.clear()
  document.body.innerHTML = ''
  localStorage.setItem('presenton.tts.lang', 'en-US')
  m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait, videos: [] })
  m.getAvatarGeneration.mockResolvedValue(null)
  m.getAvatarPreview.mockResolvedValue({ language: 'en-US', languages: ['en-US'], slides: [] })
  m.getTtsStatus.mockResolvedValue({ presentation_id: 'p1', language: 'en-US', audios: [audio(0, 'Hello'), audio(1, 'Old note')] })
  m.getPlayback.mockResolvedValue({
    bubble: { position: { x: 0, y: 0 }, size: { width: 200, height: 200 }, is_default: true },
    slides: [],
  })
  m.getPresentation.mockResolvedValue(presentation)
  m.uploadPortrait.mockResolvedValue(portrait)
  m.deletePortrait.mockResolvedValue(undefined)
  m.addPlaceholder.mockResolvedValue({})
  m.removePlaceholder.mockResolvedValue(undefined)
  m.uploadSlideVideo.mockResolvedValue({})
  m.deleteSlideVideo.mockResolvedValue(undefined)
  m.startAvatarGeneration.mockResolvedValue({ id: 'g1', type: 'x', status: 'pending' })
  m.getTask.mockResolvedValue({ id: 'g1', status: 'pending', data: { slides: [] } })
})

describe('VideoTab portrait', () => {
  it('uploads and removes the portrait', async () => {
    m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait: null, videos: [] })
    const { wrapper } = await mountTab()
    const file = new File(['x'], 'me.png', { type: 'image/png' })
    const input = wrapper.find('[data-testid="portrait-input"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(m.uploadPortrait).toHaveBeenCalledWith('p1', file)

    m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait, videos: [] })
    await queryClient.invalidateQueries({ queryKey: ['videos', 'p1'] })
    await flushPromises()
    await button(wrapper, 'Remove portrait').trigger('click')
    await flushPromises()
    expect(m.deletePortrait).toHaveBeenCalledWith('p1')
  })
})

describe('VideoTab rows', () => {
  it('shows the placeholder toggle and refetches the presentation after changing it', async () => {
    const { wrapper, invalidate } = await mountTab()
    expect(rows(wrapper)).toHaveLength(3)
    const toggles = wrapper.findAll('[role="switch"]')
    expect(toggles.map((t) => t.attributes('aria-checked'))).toEqual(['true', 'true', 'false'])
    await toggles[2].trigger('click')
    await flushPromises()
    expect(m.addPlaceholder).toHaveBeenCalledWith('p1', 2)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['presentation', 'p1'] })
    await toggles[0].trigger('click')
    await flushPromises()
    expect(m.removePlaceholder).toHaveBeenCalledWith('p1', 0)
  })

  it('uploads a slide video and removes an existing one', async () => {
    m.getVideos.mockResolvedValue({
      presentation_id: 'p1',
      generation_available: true,
      portrait,
      videos: [{ slide_index: 0, source: 'upload', stale: false, original_filename: 'clip.mp4' }],
    })
    const { wrapper } = await mountTab()
    const r = rows(wrapper)
    expect(r[0].text()).toContain('clip.mp4')
    expect(r[0].find('[data-chip]').attributes('data-chip')).toBe('uploaded')
    await r[0].find('button[aria-label="Remove video from slide 1"]').trigger('click')
    await flushPromises()
    expect(m.deleteSlideVideo).toHaveBeenCalledWith('p1', 0)

    const file = new File(['x'], 'b.mp4', { type: 'video/mp4' })
    const input = r[1].find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(m.uploadSlideVideo).toHaveBeenCalledWith('p1', 1, file)
  })

  it('shows "Narration changed — regenerate" for a slide with stale narration', async () => {
    const { wrapper } = await mountTab()
    expect(rows(wrapper)[1].text()).toContain('Narration changed — regenerate')
    expect(rows(wrapper)[0].text()).not.toContain('Narration changed')
  })

  it('shows the provider message on a failed slide', async () => {
    m.getAvatarGeneration.mockResolvedValue({
      id: 'g0',
      status: 'error',
      data: { slides: [{ slide_index: 0, slide_id: 's0', state: 'failed', reason: 'request_error', message: 'HeyGen said: face not found' }] },
    })
    const { wrapper } = await mountTab()
    const r = rows(wrapper)[0]
    expect(r.find('[data-chip]').attributes('data-chip')).toBe('failed')
    expect(r.find('[role="alert"]').text()).toBe('HeyGen said: face not found')
  })
})

describe('VideoTab generation', () => {
  const generateButton = (w: ReturnType<typeof mount>) => button(w, 'Generate avatars')

  it('is disabled with a reason when there is no portrait', async () => {
    m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait: null, videos: [] })
    const { wrapper } = await mountTab()
    expect(generateButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="avatar-reason"]').text()).toBe('Upload a presenter portrait first.')
  })

  it('is disabled when a chosen slide has stale narration or no placeholder', async () => {
    const { wrapper } = await mountTab()
    // Slides 1 and 2 are selected by default; slide 2 has stale narration.
    expect(generateButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="avatar-reason"]').text()).toContain('Slide 2 narration changed')

    await wrapper.find('input[aria-label="Select slide 2 for avatar generation"]').setValue(false)
    expect(generateButton(wrapper).attributes('disabled')).toBeUndefined()

    await wrapper.find('input[aria-label="Select slide 3 for avatar generation"]').setValue(true)
    expect(wrapper.find('[data-testid="avatar-reason"]').text()).toContain('Slide 3 has no avatar placeholder')
    expect(generateButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('starts a run for the chosen slides in the narration language', async () => {
    const { wrapper } = await mountTab()
    await wrapper.find('input[aria-label="Select slide 2 for avatar generation"]').setValue(false)
    await generateButton(wrapper).trigger('click')
    await flushPromises()
    const confirm = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Generate')!
    confirm.click()
    await flushPromises()
    expect(m.startAvatarGeneration).toHaveBeenCalledWith('p1', { slide_indices: [0], language: 'en-US', force: false })
    expect(sessionStorage.getItem('presenton.task.avatars.p1')).toBe('g1')
  })

  it('follows the running task when the backend answers 409', async () => {
    m.startAvatarGeneration.mockRejectedValue(
      new ApiError('Avatars are already being generated for this deck', 409, { detail: { message: 'x', task_id: 'g7' } }),
    )
    const { wrapper } = await mountTab()
    await wrapper.find('input[aria-label="Select slide 2 for avatar generation"]').setValue(false)
    await generateButton(wrapper).trigger('click')
    await flushPromises()
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Generate')!.click()
    await flushPromises()
    expect(sessionStorage.getItem('presenton.task.avatars.p1')).toBe('g7')
    expect(m.getTask).toHaveBeenCalledWith('g7')
  })

  it('resumes polling on mount while the latest run is still running', async () => {
    m.getAvatarGeneration.mockResolvedValue({ id: 'g9', status: 'pending', data: { slides: [] } })
    m.getTask.mockResolvedValue({
      id: 'g9',
      status: 'pending',
      data: { slides: [{ slide_index: 0, slide_id: 's0', state: 'generating' }] },
    })
    const { wrapper } = await mountTab()
    await vi.waitFor(() => expect(m.getTask).toHaveBeenCalledWith('g9'))
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(rows(wrapper)[0].find('[data-chip]').attributes('data-chip')).toBe('generating')
    expect(generateButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="avatar-reason"]').text()).toBe('An avatar generation is already running.')
  })
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
    expect(w.find('[aria-label="Narration out of date"]').exists()).toBe(true)
  })

  it('shows ready narration and an avatar dot', async () => {
    m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait, videos: [{ slide_index: 0 }] })
    const w = await mountDots(0)
    expect(w.find('[aria-label="Narration ready"]').exists()).toBe(true)
    expect(w.find('[aria-label="Avatar video"]').exists()).toBe(true)
  })

  it('shows nothing for a slide without narration or video', async () => {
    const w = await mountDots(2)
    expect(w.findAll('[role="img"]')).toHaveLength(0)
  })
})
