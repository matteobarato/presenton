import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { Ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { QueryClient, useQuery, VueQueryPlugin } from '@tanstack/vue-query'
import VoiceTab from '@/components/editor/inspector/VoiceTab.vue'
import { deckHost } from './helpers/deckHost'
import { narrationState } from '@/components/editor/inspector/narration/narration-state'

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
  const wrapper = mount(deckHost(VoiceTab), {
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
const voice = (w: VueWrapper) => w.find('[data-testid="slide-voice"]')
const show = async (w: VueWrapper, index: number) => {
  await w.setProps({ activeSlide: presentation.slides[index] as never })
  await flushPromises()
}

beforeEach(() => {
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

describe('narrationState', () => {
  it('is missing, ready or stale, ignoring whitespace', () => {
    expect(narrationState({ speaker_note: 'a b' }, undefined)).toBe('missing')
    expect(narrationState({ speaker_note: ' a\n b ' }, { text: 'a  b' })).toBe('ready')
    expect(narrationState({ speaker_note: 'a c' }, { text: 'a b' })).toBe('stale')
    expect(narrationState({ speaker_note: null }, { text: '' })).toBe('ready')
  })

  it('is translated whenever the entry is translated, whatever the note says', () => {
    expect(narrationState({ speaker_note: 'a' }, { text: 'a', translated: true })).toBe('translated')
    expect(narrationState({ speaker_note: 'changed' }, { text: 'ciao', translated: true })).toBe('translated')
    expect(narrationState({ speaker_note: 'a b' }, { text: 'a b', translated: false })).toBe('ready')
  })
})

describe('VoiceTab: the active slide', () => {
  it('shows only the active slide', async () => {
    const { wrapper } = await mountTab()
    expect(wrapper.find('[data-testid="narration-slide"]').text()).toBe('Slide 1 of 3')
    expect(wrapper.findAll('textarea')).toHaveLength(0)
    expect(wrapper.findAll('[data-testid="slide-voice"]')).toHaveLength(1)
    expect(wrapper.findAll('[role="switch"]')).toHaveLength(0)
    await show(wrapper, 2)
    expect(wrapper.find('[data-testid="narration-slide"]').text()).toBe('Slide 3 of 3')
  })

  it('disables Generate all notes while the deck is generating', async () => {
    const { useEditorStore } = await import('@/stores/editor')
    useEditorStore().generating = true
    const { wrapper } = await mountTab()
    expect(button(wrapper, 'Generate all notes').attributes('disabled')).toBeDefined()
  })

  it('lays the sections out as columns', async () => {
    const { wrapper } = await mountTab()
    const columns = wrapper.find('[data-testid="voice-columns"]')
    expect(columns.exists()).toBe(true)
    const sections = [...columns.element.children].map((e) => e.getAttribute('data-testid') ?? e.getAttribute('aria-label'))
    expect(sections).toEqual(['slide-voice', 'Whole deck'])
  })

  it('has no avatar controls', async () => {
    const { wrapper } = await mountTab()
    expect(wrapper.find('[data-testid="slide-avatar"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Presenter portrait')
    expect(wrapper.text()).not.toContain('Voice bubble')
    expect(button(wrapper, 'Generate avatars')).toBeUndefined()
  })

  it('shows the voice of the active slide: up to date, out of date or missing', async () => {
    const { wrapper } = await mountTab()
    expect(voice(wrapper).attributes('data-state')).toBe('ready')
    const el = voice(wrapper).find('audio')
    expect(el.attributes('preload')).toBe('none')
    expect(el.attributes('src')).toBe('/app_data/audio/0.mp3')

    await show(wrapper, 1)
    expect(voice(wrapper).attributes('data-state')).toBe('stale')
    expect(voice(wrapper).text()).toContain('Out of date')

    await show(wrapper, 2)
    expect(voice(wrapper).attributes('data-state')).toBe('missing')
    expect(voice(wrapper).find('audio').exists()).toBe(false)
    expect(button(wrapper, 'Generate audio').exists()).toBe(true)
  })

  it('regenerates the audio of the active slide only', async () => {
    const { wrapper } = await mountTab(1)
    await button(wrapper, 'Regenerate audio').trigger('click')
    await flushPromises()
    expect(m.generateTtsAsync).toHaveBeenCalledWith('p1', { language: 'en-US', slide_indexes: [1], regenerate: true })
  })

  it('shows a Translated badge for translated audio, still playable and regenerable', async () => {
    m.getTtsStatus.mockResolvedValue({ presentation_id: 'p1', language: 'en-US', audios: [{ ...audio(0, 'Ciao mondo'), translated: true }] })
    const { wrapper } = await mountTab()
    expect(voice(wrapper).attributes('data-state')).toBe('translated')
    expect(voice(wrapper).text()).toContain('Translated')
    expect(voice(wrapper).text()).not.toContain('Up to date')
    expect(voice(wrapper).html()).toContain('Regenerate this slide if you changed its note.')
    expect(voice(wrapper).find('audio').attributes('src')).toBe('/app_data/audio/0.mp3')
    await button(wrapper, 'Regenerate audio').trigger('click')
    await flushPromises()
    expect(m.generateTtsAsync).toHaveBeenCalledWith('p1', { language: 'en-US', slide_indexes: [0], regenerate: true })
  })
})

describe('VoiceTab: whole deck', () => {
  it('generates notes for all slides and refreshes the presentation', async () => {
    const { wrapper, invalidate } = await mountTab()
    await button(wrapper, 'Generate all notes').trigger('click')
    await flushPromises()
    expect(m.generateSpeakerNotes).toHaveBeenCalledWith('p1')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['presentation', 'p1'] })
  })

  it('summarises the narration of every slide', async () => {
    const { wrapper } = await mountTab()
    expect(wrapper.find('[data-testid="narration-counts"]').text()).toBe('1 up to date · 1 out of date · 1 without audio')
    expect(wrapper.find('[aria-label="Whole deck"] button[aria-expanded]').text()).toContain('English · 2/3 narrated')
  })

  it('collapses and remembers it', async () => {
    const { wrapper } = await mountTab()
    const toggle = wrapper.find('[aria-label="Whole deck"] button[aria-expanded]')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('#deck-narration-body').isVisible()).toBe(false)
    expect(localStorage.getItem('slideshows.editor.deck-narration-open')).toBe('false')
  })

  it('fills the language select and persists the choice', async () => {
    const { wrapper } = await mountTab()
    const select = wrapper.find('[data-testid="tts-language"]')
    expect(select.findAll('option').map((o) => o.text())).toEqual(['English', 'Italian'])
    await select.setValue('it-IT')
    expect(localStorage.getItem('slideshows.tts.lang')).toBe('it-IT')
    expect(localStorage.getItem('slideshows.tts.lang.p1')).toBe('it-IT')
    await flushPromises()
    expect(m.getTtsStatus).toHaveBeenCalledWith('p1', 'it-IT')
  })

  it('starts the deck task, shows progress, persists the id and refetches when done', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { wrapper, invalidate } = await mountTab()
    await button(wrapper, 'Generate narration').trigger('click')
    await flushPromises()
    expect(m.generateTtsAsync).toHaveBeenCalledWith('p1', { language: 'en-US' })
    expect(sessionStorage.getItem('slideshows.task.tts.p1')).toBe('t1')
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(button(wrapper, 'Regenerate audio').attributes('disabled')).toBeDefined()

    m.getTask.mockResolvedValue({ id: 't1', status: 'completed' })
    await vi.advanceTimersByTimeAsync(1100)
    await flushPromises()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tts', 'p1', 'en-US'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['playback', 'p1'] })
    expect(sessionStorage.getItem('slideshows.task.tts.p1')).toBeNull()
    vi.useRealTimers()
  })

  it('asks for confirmation before deleting narration', async () => {
    const { wrapper } = await mountTab()
    await button(wrapper, 'Delete narration').trigger('click')
    await flushPromises()
    expect(m.deleteTts).not.toHaveBeenCalled()
    dialogButton('Delete').click()
    await flushPromises()
    expect(m.deleteTts).toHaveBeenCalledWith('p1', 'en-US')
  })
})
