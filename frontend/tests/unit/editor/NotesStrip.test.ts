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
})
