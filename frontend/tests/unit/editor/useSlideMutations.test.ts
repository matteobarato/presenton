import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { QueryClient } from '@tanstack/vue-query'
import { ref } from 'vue'
import type { Presentation } from '@/api/types'
import { presentationKeys } from '@/api/presentations'

const state = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@tanstack/vue-query', async (importActual) => ({
  ...(await importActual<typeof import('@tanstack/vue-query')>()),
  useQueryClient: () => state.client,
}))
const update = vi.hoisted(() => vi.fn())
vi.mock('@/api/presentations', async (importActual) => ({
  ...(await importActual<typeof import('@/api/presentations')>()),
  updatePresentation: update,
}))
const toastError = vi.hoisted(() => vi.fn())
const toastInfo = vi.hoisted(() => vi.fn())
vi.mock('@/components/ui/sonner', () => ({ toast: { error: toastError, warning: vi.fn(), info: toastInfo } }))

import { DELETE_NOTICE, useSlideMutations } from '@/composables/useSlideMutations'
import { useHistoryStore } from '@/stores/history'

const slide = (id: string, index: number) => ({ id, index, presentation: 'p1', layout: 'modern:a', layout_group: 'modern', content: {}, properties: null })
const deck = () =>
  ({ id: 'p1', title: 'Deck', theme: { color: 'red' }, slides: [slide('a', 0), slide('b', 1), slide('c', 2)] }) as unknown as Presentation

let qc: QueryClient
beforeEach(() => {
  setActivePinia(createPinia())
  qc = new QueryClient()
  state.client = qc
  qc.setQueryData(presentationKeys.one('p1'), deck())
  update.mockReset()
  update.mockResolvedValue({})
  toastError.mockReset()
  toastInfo.mockReset()
})
afterEach(() => vi.restoreAllMocks())

const cached = () => qc.getQueryData<Presentation>(presentationKeys.one('p1'))!

describe('useSlideMutations', () => {
  it('reorder sends slides with updated index values and the theme', async () => {
    const m = useSlideMutations(ref('p1'))
    await m.reorder(0, 2)
    const body = update.mock.calls[0]![0]
    expect(body.slides.map((s: { id: string; index: number }) => [s.id, s.index])).toEqual([
      ['b', 0],
      ['c', 1],
      ['a', 2],
    ])
    expect(body.theme).toEqual({ color: 'red' })
    expect(cached().slides.map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('restores the cache and toasts when reorder fails', async () => {
    update.mockRejectedValueOnce(new Error('boom'))
    const m = useSlideMutations(ref('p1'))
    await m.reorder(0, 2)
    expect(cached().slides.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(toastError).toHaveBeenCalled()
    expect(useHistoryStore().canUndo).toBe(false)
  })

  it('undo of reorder moves the slide back', async () => {
    const m = useSlideMutations(ref('p1'))
    await m.reorder(0, 2)
    await useHistoryStore().undo()
    expect(cached().slides.map((s) => [s.id, s.index])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ])
  })

  it('removes a slide, never the last one, and undo re-inserts it', async () => {
    const m = useSlideMutations(ref('p1'))
    await m.removeSlide('b')
    expect(cached().slides.map((s) => s.id)).toEqual(['a', 'c'])
    await useHistoryStore().undo()
    expect(cached().slides.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('duplicates with a fresh id right after the source', async () => {
    const m = useSlideMutations(ref('p1'))
    await m.duplicateSlide('a')
    const ids = cached().slides.map((s) => s.id)
    expect(ids).toHaveLength(4)
    expect(ids[0]).toBe('a')
    expect(ids[1]).not.toBe('a')
  })

  it('adds a blank slide in the deck template group', async () => {
    const m = useSlideMutations(ref('p1'))
    await m.addSlide(0, null)
    const added = cached().slides[1]!
    expect(added).toMatchObject({ index: 1, layout: '__blank_slide__', layout_group: 'modern', presentation: 'p1' })
    expect(added.id).toMatch(/[0-9a-f-]{36}/)
  })

  it('rename sends only the title and the theme', async () => {
    const m = useSlideMutations(ref('p1'))
    await m.rename('  New  ')
    expect(update).toHaveBeenCalledWith({ id: 'p1', title: 'New', theme: { color: 'red' } })
    expect(cached().title).toBe('New')
  })

  it('warns that undoing a delete does not restore narration or video', async () => {
    const m = useSlideMutations(ref('p1'))
    await m.removeSlide('b')
    expect(toastInfo).toHaveBeenCalledWith('Slide deleted', { description: DELETE_NOTICE })
  })

  it('a delete queued behind a failing reorder is not erased', async () => {
    update.mockRejectedValueOnce(new Error('boom'))
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    const m = useSlideMutations(ref('p1'))
    await Promise.all([m.reorder(0, 2), m.removeSlide('b')])
    expect(cached().slides.map((s) => s.id)).not.toContain('b')
    expect(invalidate).toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('saves one at a time', async () => {
    let release!: () => void
    update.mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
    const m = useSlideMutations(ref('p1'))
    const first = m.reorder(0, 2)
    const second = m.removeSlide('b')
    await new Promise((r) => setTimeout(r, 10))
    expect(update).toHaveBeenCalledTimes(1)
    release()
    await Promise.all([first, second])
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('an in-flight refetch resolving later does not revert an optimistic reorder', async () => {
    let resolveFetch!: (d: Presentation) => void
    const fetching = qc
      .fetchQuery({
        queryKey: presentationKeys.one('p1'),
        queryFn: () => new Promise<Presentation>((r) => (resolveFetch = r)),
        staleTime: 0,
      })
      .catch(() => {})
    const m = useSlideMutations(ref('p1'))
    await m.reorder(0, 2)
    resolveFetch(deck())
    await fetching
    expect(cached().slides.map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('does nothing while a generation is running', async () => {
    const { useEditorStore } = await import('@/stores/editor')
    useEditorStore().generating = true
    const m = useSlideMutations(ref('p1'))
    await m.removeSlide('b')
    await m.addSlide(0, null)
    expect(update).not.toHaveBeenCalled()
  })
})
