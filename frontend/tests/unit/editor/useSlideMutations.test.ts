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
const get = vi.hoisted(() => vi.fn())
vi.mock('@/api/presentations', async (importActual) => ({
  ...(await importActual<typeof import('@/api/presentations')>()),
  updatePresentation: update,
  getPresentation: get,
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
  get.mockReset()
  get.mockImplementation(async () => deck())
  toastError.mockReset()
  toastInfo.mockReset()
})
afterEach(() => vi.restoreAllMocks())

const cached = () => qc.getQueryData<Presentation>(presentationKeys.one('p1'))!

describe('useSlideMutations', () => {
  it('reorder applies at once and sends slides with updated index values and the theme', async () => {
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

  it('shows the optimistic change immediately while an earlier PATCH is pending', async () => {
    let release!: () => void
    update.mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
    const m = useSlideMutations(ref('p1'))
    const first = m.reorder(0, 2)
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    const second = m.removeSlide('b')
    await vi.waitFor(() => expect(cached().slides.map((s) => s.id)).toEqual(['c', 'a']))
    expect(update).toHaveBeenCalledTimes(1)
    release()
    await Promise.all([first, second])
    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls[1]![0].slides.map((s: { id: string }) => s.id)).toEqual(['c', 'a'])
  })

  it('a reorder made while a save is in flight moves the right slide by id', async () => {
    let release!: () => void
    update.mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
    const m = useSlideMutations(ref('p1'))
    const first = m.reorder(0, 2) // b c a
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    const second = m.reorder(1, 0) // slide at index 1 now is c
    await vi.waitFor(() => expect(cached().slides.map((s) => s.id)).toEqual(['c', 'b', 'a']))
    release()
    await Promise.all([first, second])
  })

  it('on a failed save refetches the deck before the next save and does not resend the failed order', async () => {
    const order: string[] = []
    get.mockImplementation(async () => {
      order.push('get')
      return deck()
    })
    update.mockRejectedValueOnce(new Error('boom'))
    update.mockImplementation(async () => void order.push('patch'))
    const m = useSlideMutations(ref('p1'))
    await Promise.all([m.reorder(0, 2), m.removeSlide('b')])
    expect(toastError).toHaveBeenCalled()
    expect(order).toEqual(['get', 'patch'])
    const body = update.mock.calls[1]![0]
    // server truth after the refetch, not the failed [b, c, a]
    expect(body.slides.map((s: { id: string }) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('refuses a second delete on a 2-slide deck and never sends empty slides', async () => {
    const m = useSlideMutations(ref('p1'))
    await m.removeSlide('c')
    await Promise.all([m.removeSlide('a'), m.removeSlide('b')])
    expect(cached().slides).toHaveLength(1)
    for (const [body] of update.mock.calls) expect(body.slides.length).toBeGreaterThan(0)
  })

  it('double-clicking delete makes one history entry; undo re-inserts once', async () => {
    const m = useSlideMutations(ref('p1'))
    await Promise.all([m.removeSlide('b'), m.removeSlide('b')])
    const h = useHistoryStore()
    expect(cached().slides.map((s) => s.id)).toEqual(['a', 'c'])
    await h.undo()
    expect(cached().slides.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(h.canUndo).toBe(false)
  })

  it('selects the neighbour before the save settles', async () => {
    const { useEditorStore } = await import('@/stores/editor')
    const editor = useEditorStore()
    editor.select('b')
    let release!: () => void
    update.mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
    const m = useSlideMutations(ref('p1'))
    const p = m.removeSlide('b')
    await vi.waitFor(() => expect(update).toHaveBeenCalled())
    expect(editor.activeSlideId).toBe('c')
    release()
    await p
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

  it('rename saves the title with the theme', async () => {
    const m = useSlideMutations(ref('p1'))
    await m.rename('  New  ')
    expect(update.mock.calls[0]![0]).toMatchObject({ id: 'p1', title: 'New', theme: { color: 'red' } })
    expect(cached().title).toBe('New')
  })

  it('warns that undoing a delete does not restore narration or video', async () => {
    const m = useSlideMutations(ref('p1'))
    await m.removeSlide('b')
    expect(toastInfo).toHaveBeenCalledWith('Slide deleted', { description: DELETE_NOTICE })
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
    // The edit waits for the fetch and is computed from what it returns, instead of cancelling it.
    const done = m.reorder(0, 2)
    resolveFetch(deck())
    await fetching
    await done
    expect(cached().slides.map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('refuses a reorder while a chat turn holds the deck busy', async () => {
    const { useEditorStore } = await import('@/stores/editor')
    useEditorStore().deckBusy = 1
    const m = useSlideMutations(ref('p1'))
    await m.reorder(0, 2)
    await m.removeSlide('b')
    expect(update).not.toHaveBeenCalled()
    expect(cached().slides.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(useHistoryStore().canUndo).toBe(false)
  })

  it('a reorder right after a mutating turn keeps the AI-edited slide under its new id', async () => {
    // The chat tool re-ided b as b2; the invalidated cache still has the old b.
    const edited = deck()
    edited.slides[1] = { ...edited.slides[1]!, id: 'b2' }
    get.mockImplementation(async () => edited)
    await qc.invalidateQueries({ queryKey: presentationKeys.one('p1'), refetchType: 'none' })
    const m = useSlideMutations(ref('p1'))
    await m.reorder(0, 2)
    const ids = update.mock.calls[0]![0].slides.map((s: { id: string }) => s.id)
    expect(ids).toEqual(['b2', 'c', 'a'])
  })

  it('a reorder during an in-flight refetch is computed from the refetched deck', async () => {
    const edited = deck()
    edited.slides[1] = { ...edited.slides[1]!, id: 'b2' }
    let resolveFetch!: (d: Presentation) => void
    const fetching = qc
      .fetchQuery({
        queryKey: presentationKeys.one('p1'),
        queryFn: () => new Promise<Presentation>((r) => (resolveFetch = r)),
        staleTime: 0,
      })
      .catch(() => {})
    const m = useSlideMutations(ref('p1'))
    const done = m.reorder(0, 2)
    resolveFetch(edited)
    await fetching
    await done
    expect(update.mock.calls[0]![0].slides.map((s: { id: string }) => s.id)).toEqual(['b2', 'c', 'a'])
  })

  it('rename sends id, title and theme only, never slides', async () => {
    const m = useSlideMutations(ref('p1'))
    await m.rename('New name')
    const body = update.mock.calls[0]![0]
    expect(body).toEqual({ id: 'p1', title: 'New name', theme: { color: 'red' } })
    expect('slides' in body).toBe(false)
  })

  it('does nothing while a generation is running', async () => {
    const { useEditorStore } = await import('@/stores/editor')
    useEditorStore().generating = true
    const m = useSlideMutations(ref('p1'))
    await m.removeSlide('b')
    await m.addSlide(0, null)
    expect(update).not.toHaveBeenCalled()
  })

  describe('editSlideUi', () => {
    const uiA = { components: [{ id: 'x' }], elements: [] }
    const uiB = { components: [{ id: 'x' }, { id: 'y' }], elements: [] }
    beforeEach(() => {
      const d = deck()
      d.slides[0] = { ...d.slides[0]!, ui: uiA } as never
      qc.setQueryData(presentationKeys.one('p1'), d)
    })

    it('updates the slide ui and PATCHes once', async () => {
      const m = useSlideMutations(ref('p1'))
      expect(await m.editSlideUi('a', uiB, 'Move')).toBe(true)
      expect(cached().slides[0]!.ui).toEqual(uiB)
      expect(update).toHaveBeenCalledTimes(1)
    })

    it('undo restores the previous ui', async () => {
      const m = useSlideMutations(ref('p1'))
      await m.editSlideUi('a', uiB, 'Move')
      await useHistoryStore().undo()
      expect(cached().slides[0]!.ui).toEqual(uiA)
    })

    it('undo after re-id is a no-op', async () => {
      const m = useSlideMutations(ref('p1'))
      await m.editSlideUi('a', uiB, 'Move')
      const d = cached()
      qc.setQueryData(presentationKeys.one('p1'), { ...d, slides: d.slides.map((s) => (s.id === 'a' ? { ...s, id: 'a2' } : s)) })
      const before = JSON.stringify(cached())
      await expect(useHistoryStore().undo()).resolves.not.toThrow()
      expect(JSON.stringify(cached())).toBe(before)
    })

    it('returns false for an unchanged ui or unknown slide', async () => {
      const m = useSlideMutations(ref('p1'))
      expect(await m.editSlideUi('a', JSON.parse(JSON.stringify(uiA)), 'Move')).toBe(false)
      expect(await m.editSlideUi('zzz', uiB, 'Move')).toBe(false)
      expect(update).not.toHaveBeenCalled()
    })

    it('redo after undo writes the next ui again', async () => {
      const m = useSlideMutations(ref('p1'))
      await m.editSlideUi('a', uiB, 'Move')
      const h = useHistoryStore()
      await h.undo()
      expect(cached().slides[0]!.ui).toEqual(uiA)
      await h.redo()
      expect(cached().slides[0]!.ui).toEqual(uiB)
      expect(update.mock.calls.at(-1)![0].slides[0].ui).toEqual(uiB)
    })

    it('reports applied before the save settles', async () => {
      let release!: () => void
      update.mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      const m = useSlideMutations(ref('p1'))
      const onApplied = vi.fn()
      let saved = false
      const p = m.editSlideUi('a', uiB, 'Move', { onApplied }).then(() => (saved = true))
      await vi.waitFor(() => expect(onApplied).toHaveBeenCalledWith(true))
      expect(cached().slides[0]!.ui).toEqual(uiB)
      expect(saved).toBe(false)
      release()
      await p
      expect(saved).toBe(true)
    })

    it('reports not applied for an unchanged ui', async () => {
      const m = useSlideMutations(ref('p1'))
      const onApplied = vi.fn()
      await m.editSlideUi('a', JSON.parse(JSON.stringify(uiA)), 'Move', { onApplied })
      expect(onApplied).toHaveBeenCalledWith(false)
    })

    it('merges consecutive edits with the same merge key into one history entry', async () => {
      const m = useSlideMutations(ref('p1'))
      const ui = (x: number) => ({ components: [{ id: 'x', position: { x } }], elements: [] })
      await m.editSlideUi('a', ui(1), 'Nudge', { mergeKey: 'k' })
      await m.editSlideUi('a', ui(2), 'Nudge', { mergeKey: 'k' })
      await m.editSlideUi('a', ui(3), 'Nudge', { mergeKey: 'k' })
      const h = useHistoryStore()
      expect(h.undoLabel).toBe('Nudge')
      await h.undo()
      expect(cached().slides[0]!.ui).toEqual(uiA)
      expect(h.canUndo).toBe(false)
      await h.redo()
      expect(cached().slides[0]!.ui).toEqual(ui(3))
    })

    it('commits to the deck id it is given, even after the route moved on', async () => {
      qc.setQueryData(presentationKeys.one('p2'), { ...deck(), id: 'p2', slides: [] })
      const route = ref('p2')
      const m = useSlideMutations(route)
      expect(await m.editSlideUi('a', uiB, 'Edit text', { deckId: 'p1' })).toBe(true)
      expect(cached().slides[0]!.ui).toEqual(uiB)
      expect(update.mock.calls[0]![0].id).toBe('p1')
      // The history belongs to the deck now open; an edit to the deck just left is not recorded there.
      expect(useHistoryStore().canUndo).toBe(false)
    })

    it('returns false and records nothing when locked', async () => {
      const { useEditorStore } = await import('@/stores/editor')
      useEditorStore().deckBusy = 1
      const m = useSlideMutations(ref('p1'))
      expect(await m.editSlideUi('a', uiB, 'Move')).toBe(false)
      expect(update).not.toHaveBeenCalled()
      expect(cached().slides[0]!.ui).toEqual(uiA)
      expect(useHistoryStore().canUndo).toBe(false)
    })
  })

  describe('save queue coalescing', () => {
    const uiN = (x: number) => ({ components: [{ id: 'x', position: { x } }], elements: [] })

    it('saves queued behind a pending PATCH collapse into one PATCH of the latest cache', async () => {
      let release!: () => void
      update.mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      const m = useSlideMutations(ref('p1'))
      const first = m.editSlideUi('a', uiN(1), 'Nudge')
      await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1))
      const later = [m.editSlideUi('a', uiN(2), 'Nudge'), m.editSlideUi('a', uiN(3), 'Nudge'), m.editSlideUi('a', uiN(4), 'Nudge')]
      await vi.waitFor(() => expect(cached().slides[0]!.ui).toEqual(uiN(4)))
      release()
      expect(await Promise.all([first, ...later])).toEqual([true, true, true, true])
      expect(update).toHaveBeenCalledTimes(2)
      expect(update.mock.calls[1]![0].slides[0].ui).toEqual(uiN(4))
    })

    it('a skipped save resolves only once the save that covers it settles', async () => {
      let releaseFirst!: () => void
      let releaseLast!: () => void
      update.mockImplementationOnce(() => new Promise<void>((r) => (releaseFirst = r)))
      update.mockImplementationOnce(() => new Promise<void>((r) => (releaseLast = r)))
      const m = useSlideMutations(ref('p1'))
      void m.editSlideUi('a', uiN(1), 'Nudge')
      await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1))
      let skippedDone = false
      const skipped = m.editSlideUi('a', uiN(2), 'Nudge').then(() => (skippedDone = true))
      const last = m.editSlideUi('a', uiN(3), 'Nudge')
      await vi.waitFor(() => expect(cached().slides[0]!.ui).toEqual(uiN(3)))
      releaseFirst()
      await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(2))
      await new Promise((r) => setTimeout(r))
      expect(skippedDone).toBe(false)
      releaseLast()
      await Promise.all([skipped, last])
      expect(skippedDone).toBe(true)
    })

    it('a failing coalesced save still refetches server truth', async () => {
      let release!: () => void
      update.mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      update.mockRejectedValueOnce(new Error('boom'))
      const m = useSlideMutations(ref('p1'))
      const all = [m.editSlideUi('a', uiN(1), 'Nudge')]
      await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1))
      all.push(m.editSlideUi('a', uiN(2), 'Nudge'), m.editSlideUi('a', uiN(3), 'Nudge'))
      await vi.waitFor(() => expect(cached().slides[0]!.ui).toEqual(uiN(3)))
      release()
      await Promise.all(all)
      expect(update).toHaveBeenCalledTimes(2)
      expect(toastError).toHaveBeenCalledTimes(1)
      expect(get).toHaveBeenCalledTimes(1)
      expect(cached().slides[0]!.ui).toBeUndefined() // server truth: the fixture deck has no ui
    })

    it('a title-only save never absorbs an earlier slides save', async () => {
      let release!: () => void
      update.mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      const m = useSlideMutations(ref('p1'))
      const first = m.editSlideUi('a', uiN(1), 'Nudge')
      await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1))
      const edit = m.editSlideUi('a', uiN(2), 'Nudge')
      const rename = m.rename('Renamed')
      await vi.waitFor(() => expect(cached().title).toBe('Renamed'))
      release()
      await Promise.all([first, edit, rename])
      expect(update).toHaveBeenCalledTimes(3)
      expect(update.mock.calls[1]![0].slides[0].ui).toEqual(uiN(2))
      expect('slides' in update.mock.calls[2]![0]).toBe(false)
    })
  })
})
