import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

const editSlideUi = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi }) }))

import { uiTwoComponents, uiWithText } from '../../slide-editor/fixtures'
import { mountEditable, pointer, stubRect, tpl } from './harness'

let rect: ReturnType<typeof stubRect>
let current: ReturnType<typeof mountEditable> | null = null
const overlay = () => current!.wrapper.get('[data-testid="selection-overlay"]')

beforeEach(() => {
  setActivePinia(createPinia())
  editSlideUi.mockReset()
  editSlideUi.mockResolvedValue(true)
  rect = stubRect()
})
afterEach(() => {
  current?.wrapper.unmount()
  current = null
  rect.mockRestore()
})

describe('SelectionOverlay', () => {
  it('outlines the hovered component, dashed', async () => {
    current = mountEditable(tpl('a', uiTwoComponents()))
    pointer(overlay().element, 'pointermove', 700, 300)
    await nextTick()
    const hover = overlay().get('[data-hover-box]')
    expect(hover.attributes('style')).toContain('left: 46.875%')
    expect(hover.classes().join(' ')).toContain('border-dashed')
    pointer(overlay().element, 'pointerleave', 700, 300)
    await nextTick()
    expect(overlay().find('[data-hover-box]').exists()).toBe(false)
  })

  it('draws the selection box with 8 handles', async () => {
    current = mountEditable(tpl('a', uiWithText()))
    current.api().select({ kind: 'component', componentIndex: 0 })
    await nextTick()
    const box = overlay().get('[data-selection-box]')
    // 100,80 400×120 in a 1280×720 slide
    expect(box.attributes('style')).toContain('left: 7.8125%')
    expect(box.attributes('style')).toContain('width: 31.25%')
    expect(overlay().findAll('[data-handle]').map((h) => h.attributes('data-handle'))).toEqual([
      'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w',
    ])
  })

  it('double-click selects the deepest element and emits open-editor', async () => {
    current = mountEditable(tpl('a', uiWithText()))
    overlay().element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 75, clientY: 50 }))
    await nextTick()
    const sel = { kind: 'element', componentIndex: 0, elementPath: [0] }
    expect(current.api().selection.value).toEqual(sel)
    expect(current.onOpenEditor).toHaveBeenCalledWith(sel)
  })

  it('double-click on empty slide does nothing', async () => {
    current = mountEditable(tpl('a', uiWithText()))
    overlay().element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 10, clientY: 340 }))
    await nextTick()
    expect(current.onOpenEditor).not.toHaveBeenCalled()
  })

  it('a press on the slide takes focus from a text field outside the canvas', async () => {
    current = mountEditable(tpl('a', uiWithText()))
    const notes = document.createElement('textarea')
    document.body.appendChild(notes)
    notes.focus()
    expect(document.activeElement).toBe(notes)
    pointer(overlay().element, 'pointerdown', 150, 100)
    pointer(overlay().element, 'pointerup', 150, 100)
    expect(current.api().selection.value).toEqual({ kind: 'component', componentIndex: 0 })
    expect(document.activeElement).not.toBe(notes)
    notes.remove()
  })

  it('marks a gesture active from press to release', async () => {
    current = mountEditable(tpl('a', uiWithText()))
    expect(current.api().gestureActive.value).toBe(false)
    pointer(overlay().element, 'pointerdown', 150, 100)
    expect(current.api().gestureActive.value).toBe(true)
    pointer(overlay().element, 'pointermove', 250, 100)
    pointer(overlay().element, 'pointerup', 250, 100)
    expect(current.api().gestureActive.value).toBe(false)
    // A resize gesture too.
    await nextTick()
    const handle = overlay().get('[data-handle="se"]').element
    pointer(handle, 'pointerdown', 600, 300)
    expect(current.api().gestureActive.value).toBe(true)
    pointer(handle, 'pointercancel', 600, 300)
    expect(current.api().gestureActive.value).toBe(false)
  })
})
