import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Ref } from 'vue'
import { QueryClient, useQuery, VueQueryPlugin } from '@tanstack/vue-query'
import NarrationTab from '@/components/editor/inspector/NarrationTab.vue'
import { narrationState } from '@/components/editor/inspector/narration/narration-state'

const mocks = vi.hoisted(() => ({
  generateSpeakerNotes: vi.fn(),
  updateSpeakerNotes: vi.fn(),
  listTtsLanguages: vi.fn(),
  getTtsStatus: vi.fn(),
  generateTtsAsync: vi.fn(),
  deleteTts: vi.fn(),
  getTask: vi.fn(),
}))
vi.mock('@/api/speakerNotes', () => ({
  generateSpeakerNotes: mocks.generateSpeakerNotes,
  updateSpeakerNotes: mocks.updateSpeakerNotes,
}))
vi.mock('@/api/tts', async (importActual) => ({
  ...(await importActual<typeof import('@/api/tts')>()),
  listTtsLanguages: mocks.listTtsLanguages,
  getTtsStatus: mocks.getTtsStatus,
  generateTtsAsync: mocks.generateTtsAsync,
  deleteTts: mocks.deleteTts,
  // useTts calls the module-internal getTtsStatus, so rebuild it on top of the mock.
  useTts: (id: Ref<string>, lang: Ref<string>) =>
    useQuery({
      queryKey: () => ['tts', id.value, lang.value],
      queryFn: () => mocks.getTtsStatus(id.value, lang.value),
      enabled: () => Boolean(id.value && lang.value),
    }),
}))
vi.mock('@/api/tasks', () => ({ getTask: mocks.getTask }))

const slide = (index: number, note: string) => ({ id: `s${index}`, index, speaker_note: note })
const audio = (index: number, text: string) => ({
  slide_index: index,
  slide_id: `s${index}`,
  text,
  url: `/app_data/audio/${index}.mp3`,
  duration_seconds: 3,
})
const presentation = { id: 'p1', slides: [slide(0, 'Hello world'), slide(1, 'Edited note'), slide(2, 'No audio')] }

let queryClient: QueryClient
async function mountTab() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  const wrapper = mount(NarrationTab, {
    props: { presentationId: 'p1', presentation: presentation as never, activeSlide: presentation.slides[0] as never },
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    attachTo: document.body,
  })
  await flushPromises()
  await flushPromises()
  return { wrapper, invalidate }
}
const button = (w: ReturnType<typeof mount>, text: string) => w.findAll('button').find((b) => b.text().includes(text))!

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  document.body.innerHTML = ''
  mocks.listTtsLanguages.mockResolvedValue([
    { code: 'en-US', name: 'English' },
    { code: 'it-IT', name: 'Italian' },
  ])
  mocks.getTtsStatus.mockResolvedValue({
    presentation_id: 'p1',
    language: 'en-US',
    audios: [audio(0, 'Hello   world '), audio(1, 'Old note')],
  })
  mocks.generateSpeakerNotes.mockResolvedValue(presentation)
  mocks.generateTtsAsync.mockResolvedValue({ id: 't1', type: 'tts', status: 'pending' })
  mocks.getTask.mockResolvedValue({ id: 't1', status: 'pending', data: { completed_slides: 1, total_slides: 4 } })
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

describe('NarrationTab', () => {
  it('generates notes for all slides and refreshes the presentation', async () => {
    const { wrapper, invalidate } = await mountTab()
    await button(wrapper, 'Generate notes for all slides').trigger('click')
    await flushPromises()
    expect(mocks.generateSpeakerNotes).toHaveBeenCalledWith('p1')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['presentation', 'p1'] })
  })

  it('fills the language select and persists the choice', async () => {
    const { wrapper } = await mountTab()
    const select = wrapper.find('[data-testid="tts-language"]')
    expect(select.findAll('option').map((o) => o.text())).toEqual(['English', 'Italian'])
    await select.setValue('it-IT')
    expect(localStorage.getItem('presenton.tts.lang')).toBe('it-IT')
    await flushPromises()
    expect(mocks.getTtsStatus).toHaveBeenCalledWith('p1', 'it-IT')
  })

  it('starts the task, shows progress, persists the id and refetches when done', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { wrapper, invalidate } = await mountTab()
    await button(wrapper, 'Generate narration').trigger('click')
    await flushPromises()
    expect(mocks.generateTtsAsync).toHaveBeenCalledWith('p1', { language: 'en-US' })
    expect(sessionStorage.getItem('presenton.task.tts.p1')).toBe('t1')
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(true)

    mocks.getTask.mockResolvedValue({ id: 't1', status: 'completed' })
    await vi.advanceTimersByTimeAsync(1100)
    await flushPromises()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tts', 'p1', 'en-US'] })
    expect(sessionStorage.getItem('presenton.task.tts.p1')).toBeNull()
    vi.useRealTimers()
  })

  it('marks stale audio and regenerates selected slides', async () => {
    const { wrapper } = await mountTab()
    const rows = wrapper.findAll('li[data-state]')
    expect(rows.map((r) => r.attributes('data-state'))).toEqual(['ready', 'stale', 'missing'])
    expect(rows[1].text()).toContain('Stale')
    const el = rows[0].find('audio')
    expect(el.attributes('preload')).toBe('none')
    expect(el.attributes('src')).toBe('/app_data/audio/0.mp3')
    expect(rows[2].find('audio').exists()).toBe(false)

    await rows[1].find('input[type="checkbox"]').setValue(true)
    await button(wrapper, 'Regenerate selected').trigger('click')
    await flushPromises()
    expect(mocks.generateTtsAsync).toHaveBeenCalledWith('p1', { language: 'en-US', slide_indexes: [1], regenerate: true })
  })

  it('shows a Translated badge for translated audio, still playable and selectable', async () => {
    mocks.getTtsStatus.mockResolvedValue({
      presentation_id: 'p1',
      language: 'en-US',
      audios: [{ ...audio(0, 'Ciao mondo'), translated: true }],
    })
    const { wrapper } = await mountTab()
    const row = wrapper.findAll('li[data-state]')[0]
    expect(row.attributes('data-state')).toBe('translated')
    expect(row.text()).toContain('Translated')
    expect(row.text()).not.toContain('Ready')
    expect(row.html()).toContain("Regenerate this slide if you changed its note.")
    expect(row.find('audio').attributes('src')).toBe('/app_data/audio/0.mp3')
    await row.find('input[type="checkbox"]').setValue(true)
    await button(wrapper, 'Regenerate selected').trigger('click')
    await flushPromises()
    expect(mocks.generateTtsAsync).toHaveBeenCalledWith('p1', { language: 'en-US', slide_indexes: [0], regenerate: true })
  })

  it('asks for confirmation before deleting narration', async () => {
    const { wrapper } = await mountTab()
    await button(wrapper, 'Delete narration').trigger('click')
    await flushPromises()
    expect(mocks.deleteTts).not.toHaveBeenCalled()
    const confirm = [...document.body.querySelectorAll('button')].find((b) => b.textContent === 'Delete')!
    confirm.click()
    await flushPromises()
    expect(mocks.deleteTts).toHaveBeenCalledWith('p1', 'en-US')
  })
})
