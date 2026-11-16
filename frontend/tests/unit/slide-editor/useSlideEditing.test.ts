/* eslint-disable vue/one-component-per-file */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { Slide } from '@/api/types'
import type { ElementSelection } from '@/slide-editor/model'

const editSlideUi = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi }) }))

import { SLIDE_EDITING_KEY, useSlideEditing, useSlideEditingContext, type SlideEditing } from '@/slide-editor/useSlideEditing'
import { useEditorStore } from '@/stores/editor'
import { getElementAtSelection, updateElementInUi } from '@/slide-editor/model'
import { useEditingActions } from '@/slide-editor/useEditingActions'
import { addRow, tableCellAt, tableSize } from '@/slide-editor/tableOps'
import { runsToDoc } from '@/slide-editor/tiptapRuns'
import { useSelectedElement } from '@/slide-editor/useSelectedElement'
import { textRunsContent } from '@/render/legacy/components/slide-editor/text/text-runs'
import { uiTwoComponents, uiWithText } from './fixtures'

const tpl = (id: string, ui: unknown) => ({ id, index: 0, layout: 'template-v2-x:a', layout_group: 'template-v2-x', content: {}, ui }) as unknown as Slide

function setup(initial: Slide | null) {
  const slide = ref<Slide | null>(initial) as Ref<Slide | null>
  let api!: SlideEditing
  let injected: SlideEditing | undefined
  const Child = defineComponent({
    setup() {
      injected = useSlideEditingContext()
      return () => h('div')
    },
  })
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useSlideEditing(ref('p1'), slide)
        return () => h(Child)
      },
    }),
  )
  return { slide, api, injected: () => injected, wrapper }
}

beforeEach(() => {
  setActivePinia(createPinia())
  editSlideUi.mockReset()
  editSlideUi.mockResolvedValue(true)
})

describe('useSlideEditing', () => {
  it('provides itself to descendants and the context throws without a provider', () => {
    const { api, injected } = setup(tpl('a', uiWithText()))
    expect(injected()).toBe(api)
    expect(SLIDE_EDITING_KEY).toBeDefined()
    const Bare = defineComponent({ setup: () => (useSlideEditingContext(), () => h('div')) })
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => mount(Bare)).toThrow()
    spy.mockRestore()
  })

  it('is enabled for a template slide, not for smart or while busy', async () => {
    const { api, slide } = setup(tpl('a', uiWithText()))
    expect(api.enabled.value).toBe(true)
    useEditorStore().deckBusy = 1
    expect(api.enabled.value).toBe(false)
    useEditorStore().deckBusy = 0
    slide.value = { ...tpl('a', uiWithText()), html_content: '<div/>' } as Slide
    expect(api.enabled.value).toBe(false)
  })

  it('ui is draftUi ?? slide.ui', () => {
    const { api } = setup(tpl('a', uiWithText()))
    expect(api.ui.value).toEqual(uiWithText())
    api.draftUi.value = uiTwoComponents()
    expect(api.ui.value).toEqual(uiTwoComponents())
    api.cancelDraft()
    expect(api.ui.value).toEqual(uiWithText())
  })

  it('commit keeps draftUi until the committed ui arrives', async () => {
    const { api, slide } = setup(tpl('a', uiWithText()))
    const next = uiTwoComponents()
    expect(await api.commit(next, 'Move')).toBe(true)
    expect(editSlideUi).toHaveBeenCalledWith('a', next, 'Move', expect.objectContaining({ deckId: 'p1' }))
    // The cache write has not reached the slide yet: the draft holds the new ui so nothing snaps back.
    expect(api.draftUi.value).toBe(next)
    expect(api.ui.value).toBe(next)
    slide.value = tpl('a', next)
    await nextTick()
    expect(api.draftUi.value).toBeNull()
  })

  it('commit forwards onApplied and mergeKey, and names the deck', async () => {
    const { api } = setup(tpl('a', uiWithText()))
    const onApplied = vi.fn()
    editSlideUi.mockImplementation(async (_id: string, _ui: unknown, _label: string, opts: { onApplied?: (ok: boolean) => void }) => {
      opts.onApplied?.(true)
      return true
    })
    await api.commit(uiTwoComponents(), 'Nudge', { onApplied, mergeKey: 'k' })
    expect(editSlideUi).toHaveBeenCalledWith('a', uiTwoComponents(), 'Nudge', expect.objectContaining({ mergeKey: 'k', deckId: 'p1' }))
    expect(onApplied).toHaveBeenCalledWith(true)
  })

  it('commit with no slide reports not applied', async () => {
    const { api } = setup(null)
    const onApplied = vi.fn()
    expect(await api.commit(uiTwoComponents(), 'Move', { onApplied })).toBe(false)
    expect(onApplied).toHaveBeenCalledWith(false)
  })

  it('commit drops the draft when editSlideUi fails', async () => {
    editSlideUi.mockResolvedValue(false)
    const { api } = setup(tpl('a', uiWithText()))
    api.draftUi.value = uiTwoComponents()
    expect(await api.commit(uiTwoComponents(), 'Resize')).toBe(false)
    expect(api.draftUi.value).toBeNull()
  })

  it('commit of an unchanged ui leaves no draft behind', async () => {
    const { api } = setup(tpl('a', uiWithText()))
    await api.commit(uiWithText(), 'Move')
    expect(api.draftUi.value).toBeNull()
  })

  it('clears the selection when editing becomes disabled', async () => {
    const { api } = setup(tpl('a', uiWithText()))
    api.select({ kind: 'component', componentIndex: 0 })
    useEditorStore().deckBusy = 1
    await nextTick()
    expect(api.selection.value).toBeNull()
  })

  it('drops a selection whose component no longer exists', async () => {
    const { api, slide } = setup(tpl('a', uiTwoComponents()))
    api.select({ kind: 'component', componentIndex: 1 })
    slide.value = tpl('a', uiWithText())
    await nextTick()
    expect(api.selection.value).toBeNull()
  })

  it('keeps a still-valid selection when ui changes', async () => {
    const { api, slide } = setup(tpl('a', uiTwoComponents()))
    api.select({ kind: 'component', componentIndex: 0 })
    slide.value = tpl('a', uiTwoComponents())
    await nextTick()
    expect(api.selection.value).toEqual({ kind: 'component', componentIndex: 0 })
  })

  it('external ui change drops inline edit', async () => {
    const { api, slide } = setup(tpl('a', uiWithText()))
    api.inlineEdit.value = { slideId: 'a', selection: { kind: 'element', componentIndex: 0, elementPath: [0] }, element: {} } as never
    slide.value = tpl('a', uiTwoComponents())
    await nextTick()
    expect(api.inlineEdit.value).toBeNull()
    expect(editSlideUi).not.toHaveBeenCalled()
  })

  it('changing slide id clears selection and draft', async () => {
    const { api, slide } = setup(tpl('a', uiWithText()))
    api.select({ kind: 'component', componentIndex: 0 })
    api.draftUi.value = uiTwoComponents()
    slide.value = tpl('b', uiWithText())
    await nextTick()
    expect(api.selection.value).toBeNull()
    expect(api.draftUi.value).toBeNull()
  })

  it('mirrors selection into editor.slideSelectionActive', async () => {
    const { api, wrapper } = setup(tpl('a', uiWithText()))
    const editor = useEditorStore()
    expect(editor.slideSelectionActive).toBe(false)
    api.select({ kind: 'component', componentIndex: 0 })
    await nextTick()
    expect(editor.slideSelectionActive).toBe(true)
    api.select(null)
    await nextTick()
    expect(editor.slideSelectionActive).toBe(false)
    api.select({ kind: 'component', componentIndex: 0 })
    await nextTick()
    wrapper.unmount()
    expect(editor.slideSelectionActive).toBe(false)
  })

  it('an appearance op during a text edit keeps the typed text and survives the close', async () => {
    const { api } = setup(tpl('a', uiWithText()))
    const at: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }
    api.requestInlineEdit(at)
    const edit = api.inlineEdit.value!
    api.inlineEditor.value = {
      isDestroyed: false,
      getJSON: () => runsToDoc([{ text: 'Typed' }], false, { baseFont: edit.baseFont, align: 'left' }),
    } as never
    await useEditingActions(api).run('Opacity', (ui) => ({ ui: updateElementInUi(ui, at, (el) => ({ ...el, opacity: 0.5 })), selection: at }))
    expect(api.inlineEdit.value).toBeNull()
    expect(editSlideUi.mock.calls.map((c) => c[2])).toEqual(['Edit text', 'Opacity'])
    const last = getElementAtSelection(editSlideUi.mock.calls[1][1], at)!
    expect(last).toMatchObject({ opacity: 0.5 })
    expect(JSON.stringify(last)).toContain('Typed')
  })

  describe('tableCell', () => {
    const cellOf = (rows: number, cols: number) => ({
      components: [
        {
          id: 'c',
          elements: [
            {
              type: 'table',
              position: { x: 0, y: 0 },
              size: { width: 300, height: 200 },
              columns: Array.from({ length: cols }, () => ({ runs: [{ text: 'h' }] })),
              rows: Array.from({ length: rows - 1 }, () => Array.from({ length: cols }, () => ({ runs: [{ text: 'x' }] }))),
            },
          ],
        },
        { id: 'd', elements: [{ type: 'text', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } }] },
      ],
    })
    const root: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }

    it('clears when another component is selected', async () => {
      const { api } = setup(tpl('a', cellOf(3, 3)))
      api.select({ kind: 'component', componentIndex: 0 })
      api.tableCell.value = { root, row: 1, col: 1 }
      await nextTick()
      expect(api.tableCell.value).not.toBeNull()
      api.select({ kind: 'component', componentIndex: 1 })
      await nextTick()
      expect(api.tableCell.value).toBeNull()
    })

    it('clamps the row when the last row is deleted', async () => {
      const { api, slide } = setup(tpl('a', cellOf(4, 3)))
      api.select(root)
      api.tableCell.value = { root, row: 3, col: 1 }
      slide.value = tpl('a', cellOf(3, 3))
      await nextTick()
      expect(api.tableCell.value).toEqual({ root, row: 2, col: 1 })
    })

    it('clamps the column when undo returns a narrower table', async () => {
      const { api, slide } = setup(tpl('a', cellOf(3, 3)))
      api.select(root)
      api.tableCell.value = { root, row: 1, col: 2 }
      slide.value = tpl('a', cellOf(3, 2))
      await nextTick()
      expect(api.tableCell.value).toEqual({ root, row: 1, col: 1 })
    })

    it('clamps against a draft ui too', async () => {
      const { api } = setup(tpl('a', cellOf(3, 3)))
      api.select(root)
      api.tableCell.value = { root, row: 2, col: 2 }
      api.draftUi.value = cellOf(2, 2) as never
      await nextTick()
      expect(api.tableCell.value).toEqual({ root, row: 1, col: 1 })
    })

    it('is nulled when the table is gone', async () => {
      const { api, slide } = setup(tpl('a', cellOf(3, 3)))
      api.select(root)
      api.tableCell.value = { root, row: 1, col: 1 }
      slide.value = tpl('a', uiWithText())
      await nextTick()
      expect(api.tableCell.value).toBeNull()
    })

    // Inspector patches made while a cell is being typed in must not be reverted when the editor closes.
    it('a table patch during a cell edit commits the typed text first, then patches the live ui', async () => {
      const { api, slide } = setup(tpl('a', cellOf(3, 3)))
      api.select(root)
      api.requestCellEdit(root, { row: 1, col: 1 })
      const edit = api.inlineEdit.value!
      expect(edit.target).toEqual({ kind: 'cell', row: 1, col: 1 })
      api.inlineEditor.value = {
        isDestroyed: false,
        getJSON: () => runsToDoc([{ text: 'typed' }], false, { baseFont: edit.baseFont, align: 'left' }),
      } as never
      useSelectedElement(api).patch('Add row', (t) => addRow(t, 1), root)
      await nextTick()
      // The edit closed; its text and the row went in as two history entries, in that order.
      expect(api.inlineEdit.value).toBeNull()
      expect(api.tableCell.value).toEqual({ root, row: 1, col: 1 })
      expect(editSlideUi.mock.calls.map((c) => c[2])).toEqual(['Edit text', 'Add row'])
      const tableIn = (ui: unknown) => getElementAtSelection(ui as never, root)!
      const typed = tableIn(editSlideUi.mock.calls[0][1])
      const added = tableIn(editSlideUi.mock.calls[1][1])
      expect(tableSize(typed).rows).toBe(3)
      expect(textRunsContent(tableCellAt(typed, { row: 1, col: 1 })!.runs as never)).toBe('typed')
      expect(tableSize(added).rows).toBe(4)
      expect(textRunsContent(tableCellAt(added, { row: 1, col: 1 })!.runs as never)).toBe('typed')
      // Closing again (blur after the click) commits nothing more and cannot revert the row.
      await api.closeInlineEdit(true)
      expect(editSlideUi).toHaveBeenCalledTimes(2)
      slide.value = tpl('a', editSlideUi.mock.calls[1][1])
      await nextTick()
      expect(tableSize(tableIn(api.ui.value)).rows).toBe(4)
      // Undo of the row returns to the typed table: the text stays, the row goes.
      slide.value = tpl('a', editSlideUi.mock.calls[0][1])
      await nextTick()
      expect(tableSize(tableIn(api.ui.value)).rows).toBe(3)
      expect(textRunsContent(tableCellAt(tableIn(api.ui.value), { row: 1, col: 1 })!.runs as never)).toBe('typed')
    })

    it('a patch with no inline edit open leaves editing alone and commits once', async () => {
      const { api } = setup(tpl('a', cellOf(3, 3)))
      api.select(root)
      useSelectedElement(api).patch('Add row', (t) => addRow(t, 1), root)
      await nextTick()
      expect(editSlideUi.mock.calls.map((c) => c[2])).toEqual(['Add row'])
    })

    it('requestCellEdit is a harmless stub', () => {
      const { api } = setup(tpl('a', cellOf(3, 3)))
      expect(() => api.requestCellEdit(root, { row: 0, col: 0 })).not.toThrow()
    })
  })
})
