import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import NotesStrip from '@/components/editor/NotesStrip.vue'
import { presentationKeys } from '@/api/presentations'
import { useEditorStore } from '@/stores/editor'

const mocks = vi.hoisted(() => ({ generateSpeakerNotes: vi.fn(), updateSpeakerNotes: vi.fn() }))
vi.mock('@/api/speakerNotes', () => mocks)

const s = (id: string, index: number, speaker_note: string) => ({ id, index, presentation: 'p1', speaker_note })

let qc: QueryClient
beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  qc = new QueryClient()
  qc.setQueryData(presentationKeys.one('p1'), { id: 'p1', slides: [s('a', 0, 'one'), s('b', 1, 'two')] })
  mocks.generateSpeakerNotes.mockReset()
  mocks.updateSpeakerNotes.mockReset().mockResolvedValue({})
})
afterEach(() => vi.useRealTimers())

const mountStrip = (slide = s('a', 0, 'one')) =>
  mount(NotesStrip, { props: { presentationId: 'p1', slide: slide as never }, global: { plugins: [[VueQueryPlugin, { queryClient: qc }]] } })

describe('NotesStrip', () => {
  it('saves only that slide after an 800 ms debounce', async () => {
    const w = mountStrip(s('b', 1, 'two'))
    await w.find('textarea').setValue('two!')
    vi.advanceTimersByTime(799)
    expect(mocks.updateSpeakerNotes).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(mocks.updateSpeakerNotes).toHaveBeenCalledWith('p1', [{ slide_index: 1, speaker_note: 'two!' }])
    const cached = qc.getQueryData<{ slides: { speaker_note: string }[] }>(presentationKeys.one('p1'))!
    expect(cached.slides.map((x) => x.speaker_note)).toEqual(['one', 'two!'])
  })

  it('writes the note into the cache at input time, before the save resolves', async () => {
    mocks.updateSpeakerNotes.mockReturnValue(new Promise(() => {}))
    const w = mountStrip(s('b', 1, 'two'))
    await w.find('textarea').setValue('two!')
    const cached = qc.getQueryData<{ slides: { speaker_note: string }[] }>(presentationKeys.one('p1'))!
    expect(cached.slides.map((x) => x.speaker_note)).toEqual(['one', 'two!'])
    expect(mocks.updateSpeakerNotes).not.toHaveBeenCalled()
  })

  it('makes the textarea read-only while the deck is generating', () => {
    useEditorStore().generating = true
    const w = mountStrip()
    expect(w.find('textarea').attributes('readonly')).toBeDefined()
  })

  it('Generate asks for that slide only and replaces the text', async () => {
    mocks.generateSpeakerNotes.mockResolvedValue({ slides: [s('a', 0, 'fresh note')] })
    const w = mountStrip()
    await w.find('button').trigger('click')
    await flushPromises()
    expect(mocks.generateSpeakerNotes).toHaveBeenCalledWith('p1', { slide_indexes: [0], regenerate: true })
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('fresh note')
  })

  it('disables Generate while the deck is generating', () => {
    useEditorStore().generating = true
    const w = mountStrip()
    expect(w.find('button').attributes('disabled')).toBeDefined()
  })

  it('switching slides flushes the pending save for the old slide', async () => {
    const w = mountStrip()
    await w.find('textarea').setValue('one edited')
    await w.setProps({ slide: s('b', 1, 'two') as never })
    await flushPromises()
    expect(mocks.updateSpeakerNotes).toHaveBeenCalledTimes(1)
    expect(mocks.updateSpeakerNotes).toHaveBeenCalledWith('p1', [{ slide_index: 0, speaker_note: 'one edited' }])
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('two')
    vi.advanceTimersByTime(2000)
    expect(mocks.updateSpeakerNotes).toHaveBeenCalledTimes(1)
  })

  it('a refetch does not clobber a dirty draft but updates a clean one', async () => {
    const w = mountStrip()
    await w.setProps({ slide: s('a', 0, 'from narration') as never })
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('from narration')
    await w.find('textarea').setValue('typing')
    await w.setProps({ slide: s('a', 0, 'server again') as never })
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('typing')
  })

  it('flushes the pending save on unmount', async () => {
    const w = mountStrip()
    await w.find('textarea').setValue('late')
    w.unmount()
    await flushPromises()
    expect(mocks.updateSpeakerNotes).toHaveBeenCalledWith('p1', [{ slide_index: 0, speaker_note: 'late' }])
  })

  it('resolves the slide index at save time, so a reorder in the debounce window saves to the right slide', async () => {
    const w = mountStrip(s('a', 0, 'one'))
    await w.find('textarea').setValue('one!')
    qc.setQueryData(presentationKeys.one('p1'), { id: 'p1', slides: [s('b', 0, 'two'), s('a', 1, 'one')] })
    vi.advanceTimersByTime(800)
    await flushPromises()
    expect(mocks.updateSpeakerNotes).toHaveBeenCalledWith('p1', [{ slide_index: 1, speaker_note: 'one!' }])
  })

  it('keeps a failed save pending, shows the error on its slide, and retries on flush', async () => {
    mocks.updateSpeakerNotes.mockRejectedValueOnce(new Error('offline'))
    const w = mountStrip()
    await w.find('textarea').setValue('keep me')
    vi.advanceTimersByTime(800)
    await flushPromises()
    expect(w.find('[role=alert]').text()).toBe('offline')
    await w.setProps({ slide: s('b', 1, 'two') as never })
    await flushPromises()
    expect(w.find('[role=alert]').exists()).toBe(false)
    expect(mocks.updateSpeakerNotes).toHaveBeenLastCalledWith('p1', [{ slide_index: 0, speaker_note: 'keep me' }])
    expect(mocks.updateSpeakerNotes).toHaveBeenCalledTimes(2)
  })
})
