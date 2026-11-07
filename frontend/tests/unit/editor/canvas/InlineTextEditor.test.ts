import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import TemplateSlideHost from '@/render/TemplateSlideHost.vue'
import { getElementAtSelection, type ElementSelection, type RawUi } from '@/slide-editor/model'
import { uiTwoComponents, uiWithText } from '../../slide-editor/fixtures'
import { mountEditable, pointer, stubRect, tpl } from './harness'

const editSlideUi = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi }) }))

const textSel: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }

let rect: ReturnType<typeof stubRect>
let current: ReturnType<typeof mountEditable> | null = null

function setup(ui: RawUi = uiWithText()) {
  current = mountEditable(tpl('a', ui))
  editSlideUi.mockImplementation(async (id: string, next: RawUi) => {
    if (current!.slide.value?.id === id) current!.slide.value = tpl(id, next)
    return true
  })
  return current
}

const editorRoot = () => document.querySelector<HTMLElement>('[data-testid="inline-text-editor"]')
const prose = () => document.querySelector<HTMLElement>('[data-testid="inline-text-editor"] .ProseMirror')
const committedText = (call = 0) => getElementAtSelection(editSlideUi.mock.calls[call]![1] as RawUi, textSel)!.text

async function doubleClickText() {
  const overlay = current!.wrapper.get('[data-testid="selection-overlay"]').element
  // Slide (150, 100) is screen (75, 50): the text element of the fixture.
  overlay.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 75, clientY: 50 }))
  await nextTick()
  await nextTick()
  await settleFocus()
}

// Tiptap focuses on a timer, then in an animation frame; let it land so it cannot steal focus later.
async function settleFocus() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => requestAnimationFrame(() => r(null)))
}

function type(text: string) {
  current!.api().inlineEditor.value!.chain().focus('end').insertContent(text).run()
}

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(e)
  return e
}

beforeEach(() => {
  setActivePinia(createPinia())
  editSlideUi.mockReset()
  rect = stubRect()
})
afterEach(() => {
  current?.wrapper.unmount()
  current = null
  rect.mockRestore()
})

describe('InlineTextEditor', () => {
  it('double-click on text opens the editor with its text', async () => {
    const { api } = setup()
    await doubleClickText()
    expect(prose()?.textContent).toBe('Hello')
    expect(api().inlineEdit.value?.selection).toEqual(textSel)
    expect(api().inlineEditor.value).not.toBeNull()
  })

  it('sits on the element box in slide px', async () => {
    setup()
    await doubleClickText()
    const style = editorRoot()!.style
    expect(style.left).toBe('100px')
    expect(style.top).toBe('80px')
    expect(style.width).toBe('400px')
    expect(style.fontSize).toBe('24px')
  })

  it('does not open for an image', async () => {
    const { api } = setup(uiTwoComponents())
    const overlay = current!.wrapper.get('[data-testid="selection-overlay"]').element
    overlay.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 350, clientY: 150 }))
    await nextTick()
    expect(api().inlineEdit.value).toBeNull()
    expect(editorRoot()).toBeNull()
  })

  it('blanks the edited text in the rendered slide and typing never re-renders it', async () => {
    setup()
    await doubleClickText()
    const host = current!.wrapper.findComponent(TemplateSlideHost)
    const rendered = host.props('ui') as RawUi
    expect(getElementAtSelection(rendered, textSel)!.text).toBe('')
    type(' world')
    await nextTick()
    expect(host.props('ui')).toBe(rendered)
  })

  it('typing then Esc commits the new text once', async () => {
    const { api } = setup()
    await doubleClickText()
    type(' world')
    const e = press(prose()!, 'Escape')
    await flushPromises()
    expect(e.defaultPrevented).toBe(true)
    expect(editSlideUi).toHaveBeenCalledTimes(1)
    expect(editSlideUi.mock.calls[0]![0]).toBe('a')
    expect(editSlideUi.mock.calls[0]![2]).toBe('Edit text')
    expect(committedText()).toBe('Hello world')
    expect(editorRoot()).toBeNull()
    expect(api().inlineEdit.value).toBeNull()
    expect(api().inlineEditor.value).toBeNull()
    // Esc closed the editor only; the element stays selected.
    expect(api().selection.value).toEqual(textSel)
  })

  it('Esc with no change does not commit', async () => {
    setup()
    await doubleClickText()
    press(prose()!, 'Escape')
    await flushPromises()
    expect(editSlideUi).not.toHaveBeenCalled()
    expect(editorRoot()).toBeNull()
  })

  it('commits on slide change', async () => {
    const { slide } = setup()
    await doubleClickText()
    type('!')
    slide.value = tpl('b', uiTwoComponents())
    await flushPromises()
    expect(editSlideUi).toHaveBeenCalledTimes(1)
    expect(editSlideUi.mock.calls[0]![0]).toBe('a')
    expect(committedText()).toBe('Hello!')
  })

  it('commits on unmount', async () => {
    setup()
    await doubleClickText()
    type('!')
    current!.wrapper.unmount()
    current = null
    await flushPromises()
    expect(editSlideUi).toHaveBeenCalledTimes(1)
    expect(editSlideUi.mock.calls[0]![0]).toBe('a')
    expect(committedText()).toBe('Hello!')
  })

  it('commits on unmount to the deck it was opened on, even after the route moved on', async () => {
    const { deck } = setup()
    await doubleClickText()
    type('!')
    deck.value = 'p2' // back-navigation / deck switch: the route id changes before the unmount
    current!.wrapper.unmount()
    current = null
    await flushPromises()
    expect(editSlideUi).toHaveBeenCalledTimes(1)
    expect(editSlideUi.mock.calls[0]![3]).toMatchObject({ deckId: 'p1' })
    expect(committedText()).toBe('Hello!')
  })

  it('an external ui change closes the editor without committing', async () => {
    const { api, slide } = setup()
    await doubleClickText()
    type('!')
    slide.value = tpl('a', uiTwoComponents())
    await flushPromises()
    expect(editorRoot()).toBeNull()
    expect(api().inlineEdit.value).toBeNull()
    expect(editSlideUi).not.toHaveBeenCalled()
  })

  it('selecting something else commits and closes', async () => {
    const { api } = setup(uiTwoComponents())
    await doubleClickText()
    type('!')
    api().select({ kind: 'component', componentIndex: 1 })
    await flushPromises()
    expect(editorRoot()).toBeNull()
    expect(committedText()).toBe('Hello!')
  })

  it('autofocuses with the caret at the end', async () => {
    setup()
    await doubleClickText()
    const editor = current!.api().inlineEditor.value!
    expect(editor.isFocused).toBe(true)
    expect(editor.state.selection.from).toBe(editor.state.doc.content.size - 1)
  })

  it('a press on the slide outside the editor commits first', async () => {
    setup()
    await doubleClickText()
    type('!')
    // Inside the element's box, below the auto-sized editor.
    const overlay = current!.wrapper.get('[data-testid="selection-overlay"]').element
    pointer(overlay, 'pointerdown', 150, 190)
    pointer(overlay, 'pointerup', 150, 190)
    await flushPromises()
    expect(editorRoot()).toBeNull()
    expect(editSlideUi).toHaveBeenCalledTimes(1)
    expect(committedText()).toBe('Hello!')
  })

  it('a press inside the editor or the toolbar keeps it open', async () => {
    setup()
    await doubleClickText()
    pointer(prose()!, 'pointerdown', 0, 0)
    const toolbar = document.createElement('div')
    toolbar.dataset.inlineEditIgnore = 'true'
    document.body.append(toolbar)
    pointer(toolbar, 'pointerdown', 0, 0)
    toolbar.remove()
    await flushPromises()
    expect(editorRoot()).not.toBeNull()
  })

  it('a blur to outside commits; focus moving to the toolbar does not', async () => {
    setup()
    await doubleClickText()
    type('!')
    await settleFocus()
    const toolbar = document.createElement('div')
    toolbar.dataset.inlineEditIgnore = 'true'
    const toolbarInput = document.createElement('input')
    toolbar.append(toolbarInput)
    const outside = document.createElement('input')
    document.body.append(toolbar, outside)
    try {
      toolbarInput.focus()
      await new Promise((r) => setTimeout(r, 5))
      await flushPromises()
      expect(editorRoot()).not.toBeNull()
      expect(editSlideUi).not.toHaveBeenCalled()

      current!.api().inlineEditor.value!.commands.focus()
      await settleFocus()
      expect(current!.api().inlineEditor.value!.isFocused).toBe(true)
      outside.focus()
      await vi.waitFor(() => expect(editorRoot()).toBeNull())
      await flushPromises()
      expect(committedText()).toBe('Hello!')
    } finally {
      toolbar.remove()
      outside.remove()
    }
  })

  it('edits a text-list: Enter starts a new bulleted item', async () => {
    const base = uiWithText() as Record<string, unknown>
    const component = (base.components as Record<string, unknown>[])[0]!
    const ui = {
      ...base,
      components: [
        {
          ...component,
          elements: [
            {
              type: 'text-list',
              marker: 'bullet',
              position: { x: 0, y: 0 },
              size: { width: 400, height: 120 },
              items: [{ text: 'One' }, { text: 'Two' }],
              font: { family: 'Arial', size: 20, color: '111111' },
            },
          ],
        },
      ],
    } as RawUi
    const { api } = setup(ui)
    api().requestInlineEdit(textSel)
    await nextTick()
    await settleFocus()
    expect(prose()!.querySelectorAll('p')).toHaveLength(2)
    api().inlineEditor.value!.commands.focus('end')
    press(prose()!, 'Enter')
    type('Three')
    expect(prose()!.querySelectorAll('p')[2]!.textContent).toBe('• Three')
    press(prose()!, 'Escape')
    await flushPromises()
    const items = getElementAtSelection(editSlideUi.mock.calls[0]![1] as RawUi, textSel)!.items as unknown[]
    // Edited items are stored as run arrays, as the old editor stores them.
    const itemText = (item: unknown) => (item as { text: string }[]).map((r) => r.text).join('')
    expect(items.map(itemText)).toEqual(['One', 'Two', 'Three'])
  })

  describe('own commits landing late', () => {
    // editSlideUi that writes the slide only when the test lands it, like a save behind a refetch.
    function deferCommits() {
      const pending: { id: string; next: RawUi; resolve: (ok: boolean) => void }[] = []
      editSlideUi.mockImplementation(
        (id: string, next: RawUi) => new Promise<boolean>((resolve) => pending.push({ id, next, resolve })),
      )
      const land = async (i: number) => {
        const c = pending[i]!
        current!.slide.value = tpl(c.id, c.next)
        await nextTick()
        c.resolve(true)
        await flushPromises()
      }
      return { pending, land }
    }

    it('a pending text commit landing does not drop a reopened edit', async () => {
      const { api } = setup()
      const { pending, land } = deferCommits()
      await doubleClickText()
      type('A')
      press(prose()!, 'Escape')
      await flushPromises()
      expect(pending).toHaveLength(1)
      api().requestInlineEdit(textSel)
      await nextTick()
      await settleFocus()
      expect(prose()?.textContent).toBe('HelloA')
      type('B')
      await land(0)
      expect(editorRoot()).not.toBeNull()
      expect(prose()?.textContent).toBe('HelloAB')
      expect(api().inlineEdit.value).not.toBeNull()
      press(prose()!, 'Escape')
      await flushPromises()
      expect(pending).toHaveLength(2)
      expect(committedText(1)).toBe('HelloAB')
    })

    it('a pending Move landing does not drop an edit opened after it', async () => {
      const { api } = setup()
      const { pending, land } = deferCommits()
      const moved = uiWithText() as Record<string, unknown>
      ;(moved.components as { position: { x: number } }[])[0]!.position.x = 300
      void api().commit(moved as RawUi, 'Move')
      api().requestInlineEdit(textSel)
      await nextTick()
      await settleFocus()
      type('!')
      await land(0)
      expect(editorRoot()).not.toBeNull()
      press(prose()!, 'Escape')
      await flushPromises()
      expect(pending).toHaveLength(2)
      const next = pending[1]!.next
      expect(getElementAtSelection(next, textSel)!.text).toBe('Hello!')
      expect((next.components as { position: { x: number } }[])[0]!.position.x).toBe(300)
    })

    it('an external change while an own commit is pending still drops the edit', async () => {
      const { api, slide } = setup()
      deferCommits()
      void api().commit(uiTwoComponents(), 'Move')
      api().requestInlineEdit(textSel)
      await nextTick()
      type('!')
      slide.value = tpl('a', uiWithText())
      await flushPromises()
      expect(editorRoot()).toBeNull()
      expect(editSlideUi).toHaveBeenCalledTimes(1)
    })
  })

  it('Enter on a selected text element opens the editor', async () => {
    const { api } = setup()
    api().select(textSel)
    await nextTick()
    press(window, 'Enter')
    await nextTick()
    await nextTick()
    expect(prose()?.textContent).toBe('Hello')
  })
})
