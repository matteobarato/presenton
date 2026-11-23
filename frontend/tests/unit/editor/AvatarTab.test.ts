/* eslint-disable vue/one-component-per-file -- tiny inline consumers are the point of the shared-state test */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, type Ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { QueryClient, useQuery, VueQueryPlugin } from '@tanstack/vue-query'
import { ApiError } from '@/api/errors'
import AvatarTab from '@/components/editor/inspector/AvatarTab.vue'
import DeckStateProvider from '@/components/editor/DeckStateProvider.vue'
import { injectDeckNarration, type DeckNarration } from '@/components/editor/inspector/narration/useDeckNarration'
import { deckHost } from './helpers/deckHost'

const m = vi.hoisted(() => ({
  generateSpeakerNotes: vi.fn(),
  updateSpeakerNotes: vi.fn(),
  listTtsLanguages: vi.fn(),
  getTtsStatus: vi.fn(),
  generateTtsAsync: vi.fn(),
  deleteTts: vi.fn(),
  getTask: vi.fn(),
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
  getPlayback: vi.fn(),
}))
vi.mock('@/api/speakerNotes', () => ({ generateSpeakerNotes: m.generateSpeakerNotes, updateSpeakerNotes: m.updateSpeakerNotes }))
vi.mock('@/api/tts', async (orig) => ({
  ...(await orig<typeof import('@/api/tts')>()),
  listTtsLanguages: m.listTtsLanguages,
  getTtsStatus: m.getTtsStatus,
  generateTtsAsync: m.generateTtsAsync,
  deleteTts: m.deleteTts,
  // useTts calls the module-internal getTtsStatus, so rebuild it on top of the mock.
  useTts: (id: Ref<string>, lang: Ref<string>) =>
    useQuery({
      queryKey: () => ['tts', id.value, lang.value],
      queryFn: () => m.getTtsStatus(id.value, lang.value),
      enabled: () => Boolean(id.value && lang.value),
    }),
}))
vi.mock('@/api/tasks', () => ({ getTask: m.getTask }))
vi.mock('@/api/videos', async (orig) => ({
  ...(await orig<typeof import('@/api/videos')>()),
  getVideos: m.getVideos,
  getAvatarGeneration: m.getAvatarGeneration,
  getAvatarPreview: m.getAvatarPreview,
  uploadPortrait: m.uploadPortrait,
  deletePortrait: m.deletePortrait,
  addPlaceholder: m.addPlaceholder,
  removePlaceholder: m.removePlaceholder,
  uploadSlideVideo: m.uploadSlideVideo,
  deleteSlideVideo: m.deleteSlideVideo,
  startAvatarGeneration: m.startAvatarGeneration,
}))
vi.mock('@/api/playback', async (orig) => ({ ...(await orig<typeof import('@/api/playback')>()), getPlayback: m.getPlayback }))
const media = vi.hoisted(() => ({ narrow: { value: false } as { value: boolean } }))
vi.mock('@vueuse/core', async (orig) => {
  const { computed } = await import('vue')
  return { ...(await orig<typeof import('@vueuse/core')>()), useMediaQuery: () => computed(() => media.narrow.value) }
})
vi.mock('@/render/SlideView.vue', () => ({ default: { template: '<div data-testid="slide-view" />' } }))

const placeholderUi = { components: [{ elements: [{ type: 'image', video_placeholder: true }] }] }
const slide = (index: number, note: string, ui: unknown = {}) => ({ id: `s${index}`, index, speaker_note: note, ui })
const audio = (index: number, text: string) => ({
  slide_index: index,
  slide_id: `s${index}`,
  text,
  url: `/app_data/audio/${index}.mp3`,
  duration_seconds: 3,
})
const presentation = {
  id: 'p1',
  slides: [slide(0, 'Hello world', placeholderUi), slide(1, 'Edited note', placeholderUi), slide(2, 'No audio')],
}
const portrait = { url: '/app_data/portrait.png', mime_type: 'image/png', width: 10, height: 10, size_bytes: 1, updated_at: '' }

let queryClient: QueryClient
async function mountTab(active = 0) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  const wrapper = mount(deckHost(AvatarTab), {
    props: { presentationId: 'p1', presentation: presentation as never, activeSlide: presentation.slides[active] as never },
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    attachTo: document.body,
  })
  await flushPromises()
  await flushPromises()
  return { wrapper, invalidate }
}
const button = (w: VueWrapper, text: string) => w.findAll('button').find((b) => b.text().trim() === text)!
const dialogButton = (text: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!
const avatar = (w: VueWrapper) => w.find('[data-testid="slide-avatar"]')
const show = async (w: VueWrapper, index: number) => {
  await w.setProps({ activeSlide: presentation.slides[index] as never })
  await flushPromises()
}

beforeEach(() => {
  media.narrow.value = false
  setActivePinia(createPinia())
  Object.values(m).forEach((f) => f.mockReset())
  localStorage.clear()
  sessionStorage.clear()
  document.body.innerHTML = ''
  m.listTtsLanguages.mockResolvedValue([
    { code: 'en-US', name: 'English' },
    { code: 'it-IT', name: 'Italian' },
  ])
  m.getTtsStatus.mockResolvedValue({
    presentation_id: 'p1',
    language: 'en-US',
    audios: [audio(0, 'Hello   world '), audio(1, 'Old note')],
  })
  m.generateSpeakerNotes.mockResolvedValue(presentation)
  m.updateSpeakerNotes.mockResolvedValue(undefined)
  m.generateTtsAsync.mockResolvedValue({ id: 't1', type: 'tts', status: 'pending' })
  m.getTask.mockResolvedValue({ id: 't1', status: 'pending', data: { completed_slides: 1, total_slides: 4 } })
  m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait, videos: [] })
  m.getAvatarGeneration.mockResolvedValue(null)
  m.getAvatarPreview.mockResolvedValue({ language: 'en-US', languages: ['en-US'], slides: [] })
  m.getPlayback.mockResolvedValue({
    bubble: { position: { x: 0, y: 0 }, size: { width: 200, height: 200 }, is_default: true },
    slides: [],
  })
  m.uploadPortrait.mockResolvedValue(portrait)
  m.deletePortrait.mockResolvedValue(undefined)
  m.addPlaceholder.mockResolvedValue({})
  m.removePlaceholder.mockResolvedValue(undefined)
  m.uploadSlideVideo.mockResolvedValue({})
  m.deleteSlideVideo.mockResolvedValue(undefined)
  m.startAvatarGeneration.mockResolvedValue({ id: 'g1', type: 'x', status: 'pending' })
})

describe('AvatarTab: whole deck', () => {
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
    await wrapper.find('button[aria-label="Remove portrait"]').trigger('click')
    await flushPromises()
    expect(m.deletePortrait).toHaveBeenCalledWith('p1')
  })
})


describe('AvatarTab: avatar of the active slide', () => {
  it('toggles the placeholder and refetches the presentation', async () => {
    const { wrapper, invalidate } = await mountTab()
    const toggle = () => wrapper.find('[role="switch"]')
    expect(toggle().attributes('aria-checked')).toBe('true')
    await toggle().trigger('click')
    await flushPromises()
    expect(m.removePlaceholder).toHaveBeenCalledWith('p1', 0)

    await show(wrapper, 2)
    expect(toggle().attributes('aria-checked')).toBe('false')
    await toggle().trigger('click')
    await flushPromises()
    expect(m.addPlaceholder).toHaveBeenCalledWith('p1', 2)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['presentation', 'p1'] })
  })

  it('keeps the placeholder toggle busy until the presentation refetch lands', async () => {
    const { wrapper, invalidate } = await mountTab(2)
    let land!: () => void
    invalidate.mockImplementation(((filters: { queryKey: unknown[] }) =>
      filters.queryKey[0] === 'presentation' ? new Promise<void>((r) => (land = r)) : Promise.resolve()) as never)
    await wrapper.find('[role="switch"]').trigger('click')
    await flushPromises()
    expect(m.addPlaceholder).toHaveBeenCalledWith('p1', 2)
    expect(wrapper.find('[role="switch"]').attributes('disabled')).toBeDefined()
    land()
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('disabled')).toBeUndefined()
  })

  it('uploads a slide video and removes an existing one', async () => {
    m.getVideos.mockResolvedValue({
      presentation_id: 'p1',
      generation_available: true,
      portrait,
      videos: [{ slide_index: 0, slide_id: 's0', source: 'upload', stale: false, original_filename: 'clip.mp4' }],
    })
    const { wrapper } = await mountTab()
    expect(avatar(wrapper).text()).toContain('clip.mp4')
    expect(avatar(wrapper).attributes('data-chip')).toBe('uploaded')
    await avatar(wrapper).find('button[aria-label="Remove video from slide 1"]').trigger('click')
    await flushPromises()
    expect(m.deleteSlideVideo).toHaveBeenCalledWith('p1', 0)

    await show(wrapper, 1)
    const file = new File(['x'], 'b.mp4', { type: 'video/mp4' })
    const input = avatar(wrapper).find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(m.uploadSlideVideo).toHaveBeenCalledWith('p1', 1, file)
  })

  it('warns when the video was recorded for another narration language', async () => {
    const video = (language: string) => ({ slide_index: 0, slide_id: 's0', source: 'heygen', stale: false, language })
    m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait, videos: [video('it-IT')] })
    const { wrapper } = await mountTab()
    expect(avatar(wrapper).attributes('data-chip')).toBe('other_language')
    expect(avatar(wrapper).get('[data-testid="slide-avatar-language"]').text()).toContain(
      'recorded for Italian narration, so Present and the video export hide it while the deck plays in English',
    )

    m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait, videos: [video('en-US')] })
    await queryClient.invalidateQueries({ queryKey: ['videos', 'p1'] })
    await flushPromises()
    expect(avatar(wrapper).attributes('data-chip')).toBe('done')
    expect(avatar(wrapper).find('[data-testid="slide-avatar-language"]').exists()).toBe(false)
  })

  it('explains why a slide with stale narration cannot get an avatar', async () => {
    const { wrapper } = await mountTab(1)
    expect(avatar(wrapper).text()).toContain('Narration changed since it was recorded. Regenerate it first.')
    expect(button(wrapper, 'Generate avatar').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="slide-avatar-reason"]').exists()).toBe(false)
    await show(wrapper, 0)
    expect(avatar(wrapper).text()).not.toContain('Narration changed')
    expect(button(wrapper, 'Generate avatar').attributes('disabled')).toBeUndefined()
  })

  it('explains a deck-wide blocker on the slide too', async () => {
    m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait: null, videos: [] })
    const { wrapper } = await mountTab()
    expect(button(wrapper, 'Generate avatar').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="slide-avatar-reason"]').text()).toBe('Upload a presenter portrait first.')
  })

  it('generates the avatar of the active slide only', async () => {
    const { wrapper } = await mountTab()
    await button(wrapper, 'Generate avatar').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('1 slide will get a lip-synced avatar')
    dialogButton('Generate').click()
    await flushPromises()
    expect(m.startAvatarGeneration).toHaveBeenCalledWith('p1', { slide_indices: [0], language: 'en-US', force: false })
    expect(sessionStorage.getItem('slideshows.task.avatars.p1')).toBe('g1')
  })

  it('shows the provider message on a failed slide', async () => {
    m.getAvatarGeneration.mockResolvedValue({
      id: 'g0',
      status: 'error',
      data: { slides: [{ slide_index: 0, slide_id: 's0', state: 'failed', reason: 'request_error', message: 'HeyGen said: face not found' }] },
    })
    const { wrapper } = await mountTab()
    expect(avatar(wrapper).attributes('data-chip')).toBe('failed')
    expect(avatar(wrapper).find('[role="alert"]').text()).toBe('HeyGen said: face not found')
  })
})

describe('AvatarTab: avatars for the whole deck', () => {
  const generateAll = (w: VueWrapper) => button(w, 'Generate avatars')

  it('is disabled with a reason when there is no portrait', async () => {
    m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait: null, videos: [] })
    const { wrapper } = await mountTab()
    expect(generateAll(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="avatar-reason"]').text()).toBe('Upload a presenter portrait first.')
  })

  it('covers only placeholder slides with up-to-date narration', async () => {
    const { wrapper } = await mountTab()
    expect(wrapper.find('[aria-label="Whole deck avatars"]').text()).toContain('1 of 2 presenter slides ready to generate')
    await generateAll(wrapper).trigger('click')
    await flushPromises()
    dialogButton('Generate').click()
    await flushPromises()
    expect(m.startAvatarGeneration).toHaveBeenCalledWith('p1', { slide_indices: [0], language: 'en-US', force: false })
  })

  it('is disabled when no placeholder slide is ready', async () => {
    m.getTtsStatus.mockResolvedValue({ presentation_id: 'p1', language: 'en-US', audios: [] })
    const { wrapper } = await mountTab()
    expect(generateAll(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="avatar-reason"]').text()).toBe('Presenter slides need up-to-date narration first. Generate it in the Voice tab.')
  })

  it('follows the running task when the backend answers 409', async () => {
    m.startAvatarGeneration.mockRejectedValue(
      new ApiError('Avatars are already being generated for this deck', 409, { detail: { message: 'x', task_id: 'g7' } }),
    )
    m.getTask.mockResolvedValue({ id: 'g7', status: 'pending', data: { slides: [] } })
    const { wrapper } = await mountTab()
    await generateAll(wrapper).trigger('click')
    await flushPromises()
    dialogButton('Generate').click()
    await flushPromises()
    expect(sessionStorage.getItem('slideshows.task.avatars.p1')).toBe('g7')
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
    expect(avatar(wrapper).attributes('data-chip')).toBe('generating')
    expect(generateAll(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="avatar-reason"]').text()).toBe('An avatar generation is already running.')
  })
})

describe('AvatarTab: layout and shared state', () => {
  it('has no speech controls', async () => {
    const { wrapper } = await mountTab()
    expect(wrapper.find('[data-testid="slide-voice"]').exists()).toBe(false)
    expect(wrapper.findAll('button').some((b) => ['Generate narration', 'Generate all notes', 'Delete narration'].includes(b.text().trim()))).toBe(false)
  })

  it('shows the narration language read-only and follows a change made elsewhere', async () => {
    let narration: DeckNarration | undefined
    const Sibling = defineComponent({
      setup() {
        narration = injectDeckNarration()
        return () => h('div')
      },
    })
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(DeckStateProvider, { presentationId: 'p1', presentation: presentation as never }, () => [
            h(AvatarTab, { presentationId: 'p1', presentation: presentation as never, activeSlide: presentation.slides[0] as never }),
            h(Sibling),
          ]),
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient }]] }, attachTo: document.body },
    )
    await flushPromises()
    await flushPromises()
    const line = () => wrapper.find('[data-testid="avatar-language"]')
    expect(line().text()).toContain('English')
    expect(line().find('select').exists()).toBe(false)
    narration!.setLanguage('it-IT')
    await flushPromises()
    expect(line().text()).toContain('Italian')
  })

  it('renders without an active slide', async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = mount(deckHost(AvatarTab), {
      props: { presentationId: 'p1', presentation: presentation as never, activeSlide: null },
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="slide-avatar"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Select a slide')
    expect(wrapper.find('[aria-label="Whole deck avatars"]').exists()).toBe(true)
  })

  it('shows the progress of a running deck generation exactly once', async () => {
    m.getAvatarGeneration.mockResolvedValue({ id: 'g9', status: 'pending', data: { slides: [] } })
    m.getTask.mockResolvedValue({ id: 'g9', status: 'pending', data: { slides: [{ slide_index: 5, slide_id: 'x', state: 'generating' }] } })
    const { wrapper } = await mountTab(2) // slide 3 has no placeholder: only the deck section shows the run
    await vi.waitFor(() => expect(m.getTask).toHaveBeenCalledWith('g9'))
    await flushPromises()
    expect(wrapper.findAll('[aria-label="Avatar generation progress"]')).toHaveLength(1)
  })
})

describe('AvatarTab: layout and fixes', () => {
  const deck = (w: VueWrapper) => w.find('[data-testid="avatar-overview"]')
  const openVoice = (w: VueWrapper) => w.find('[data-testid="slide-avatar-open-voice"]')

  it('runs portrait, this slide, the whole deck, the slide list, then the voice bubble', async () => {
    const { wrapper } = await mountTab()
    const root = wrapper.find('section[aria-label="Avatar"]')
    const sections = [...root.element.children]
      .map((e) => e.getAttribute('data-testid') ?? e.getAttribute('aria-label'))
      .filter(Boolean)
    expect(sections).toEqual(['portrait-hero', 'slide-avatar', 'avatar-overview', 'avatar-slide-list', 'Voice bubble'])
  })

  it('says once, in plain words, how to turn generation on when the server is not configured', async () => {
    m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: false, portrait: null, videos: [] })
    const { wrapper } = await mountTab()
    const reason = deck(wrapper).find('[data-testid="avatar-reason"]')
    expect(reason.attributes('data-state')).toBe('off')
    expect(reason.text()).toContain('OPENROUTER_API_KEY')
    expect(reason.text()).toContain('upload')
    expect(deck(wrapper).text().match(/OPENROUTER_API_KEY/g)).toHaveLength(1)
  })

  it('marks never-generated presenter slides as a to-do, not an error', async () => {
    const { wrapper } = await mountTab()
    expect(deck(wrapper).find('[data-testid="deck-avatar-state"]').text()).toBe('Needs update')
    m.getTtsStatus.mockResolvedValue({ presentation_id: 'p1', language: 'en-US', audios: [audio(0, 'Hello world'), audio(1, 'Edited note')] })
    await queryClient.invalidateQueries()
    await flushPromises()
    expect(deck(wrapper).find('[data-testid="deck-avatar-state"]').text()).toBe('To generate')
    expect(button(wrapper, 'Generate 2 avatars').exists()).toBe(true)
  })

  it('turns the presenter on from the slide switch, and says why Generate is off until then', async () => {
    const { wrapper } = await mountTab(2)
    expect(button(wrapper, 'Generate avatar').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="slide-avatar-reason"]').text()).toBe('Turn the presenter on to generate a video for this slide.')
    await wrapper.find('[role="switch"]').trigger('click')
    await flushPromises()
    expect(m.addPlaceholder).toHaveBeenCalled()
  })

  it('tells a video kept on a slide with the presenter off that it will not play', async () => {
    m.getVideos.mockResolvedValue({
      presentation_id: 'p1',
      generation_available: true,
      portrait,
      videos: [{ slide_index: 2, slide_id: 's2', source: 'heygen', stale: false }],
    })
    const { wrapper } = await mountTab(2)
    expect(avatar(wrapper).find('[data-testid="slide-video-hidden"]').exists()).toBe(true)
  })

  it('opens the footer Voice tab from a narration fix', async () => {
    const { useEditorStore } = await import('@/stores/editor')
    const { wrapper } = await mountTab(1)
    await openVoice(wrapper).trigger('click')
    expect(useEditorStore().footerOpen).toBe(true)
    expect(useEditorStore().footerTab).toBe('voice')
  })

  it('offers both ways to add a video on a slide without one', async () => {
    const { wrapper } = await mountTab()
    expect(avatar(wrapper).text()).toContain('No video yet')
    expect(button(avatar(wrapper) as never, 'Generate avatar').exists()).toBe(true)
    expect(button(avatar(wrapper) as never, 'Upload video').exists()).toBe(true)
  })

  it('closes the inspector drawer when a fix opens the footer, so the footer is visible', async () => {
    media.narrow.value = true
    const { useEditorStore } = await import('@/stores/editor')
    const editor = useEditorStore()
    editor.inspectorOpen = true
    const { wrapper } = await mountTab(1)
    await openVoice(wrapper).trigger('click')
    expect(editor.footerTab).toBe('voice')
    expect(editor.inspectorOpen).toBe(false)
  })

  it('keeps the docked inspector open when a fix opens the footer', async () => {
    const { useEditorStore } = await import('@/stores/editor')
    const editor = useEditorStore()
    editor.inspectorOpen = true
    const { wrapper } = await mountTab(1)
    await openVoice(wrapper).trigger('click')
    expect(editor.inspectorOpen).toBe(true)
  })

  it('shows one progress bar while the active slide is the one generating', async () => {
    m.getAvatarGeneration.mockResolvedValue({ id: 'g9', status: 'pending', data: { slides: [] } })
    m.getTask.mockResolvedValue({ id: 'g9', status: 'pending', data: { slides: [{ slide_index: 0, slide_id: 's0', state: 'generating' }] } })
    const { wrapper } = await mountTab(0)
    await vi.waitFor(() => expect(m.getTask).toHaveBeenCalledWith('g9'))
    await flushPromises()
    expect(avatar(wrapper).attributes('data-chip')).toBe('generating')
    expect(wrapper.findAll('[aria-label="Avatar generation progress"]')).toHaveLength(1)
  })
})
