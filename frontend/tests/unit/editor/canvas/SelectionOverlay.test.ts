import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

const editSlideUi = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi }) }))

import type { RawUi } from '@/slide-editor/model'
import { uiTwoComponents, uiWithText, uiWithVideoPlaceholder } from '../../slide-editor/fixtures'
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

  describe('rotation', () => {
    // Text component 100,80 400×120: centre (300,140), rotate handle 24 screen px (48 slide px) below the box.
    const rotated = (deg: number): RawUi => {
      const ui = uiWithText() as unknown as { components: Record<string, unknown>[] }
      ui.components[0]!.rotation = deg
      return ui as unknown as RawUi
    }
    const handle = () => overlay().get('[data-rotate-handle]').element
    const layer = () =>
      (current!.wrapper.get('[data-template-host]').element as HTMLElement).shadowRoot!.querySelector<HTMLElement>('[data-hf-el="e0"]')!
    const at = (deg: number, r = 108) => ({
      x: 300 + r * Math.cos((deg * Math.PI) / 180),
      y: 140 + r * Math.sin((deg * Math.PI) / 180),
    })
    // Press the handle (directly below the centre at 90°), then move to the given angle about the centre.
    async function rotateTo(start: number, angles: number[], init: PointerEventInit = {}, release = true) {
      const from = at(start)
      pointer(handle(), 'pointerdown', from.x, from.y)
      for (const a of angles) {
        const p = at(a)
        pointer(handle(), 'pointermove', p.x, p.y, init)
      }
      const last = at(angles[angles.length - 1]!)
      if (release) pointer(handle(), 'pointerup', last.x, last.y, init)
      await nextTick()
    }
    async function select(ui: RawUi, sel: Parameters<ReturnType<typeof mountEditable>['api'] extends () => infer A ? (A extends { select: (s: infer S) => unknown } ? (s: S) => void : never) : never>[0]) {
      current = mountEditable(tpl('a', ui))
      current.api().select(sel)
      await nextTick()
    }

    it('draws a rotated component rotated about its centre, handles inside', async () => {
      await select(rotated(30), { kind: 'component', componentIndex: 0 })
      const box = overlay().get('[data-selection-box]')
      expect(box.attributes('style')).toContain('rotate(30deg)')
      expect(box.find('[data-handle="se"]').exists()).toBe(true)
      // Rotated 30°: the nw handle's resize axis points along 255°, the closest 45° step is 270° (ns).
      expect(box.get('[data-handle="nw"]').attributes('style')).toContain('cursor: ns-resize')
    })

    it('shows the rotate handle for a single component only', async () => {
      await select(uiWithText(), { kind: 'component', componentIndex: 0 })
      expect(overlay().find('[data-rotate-handle]').exists()).toBe(true)
      expect(overlay().get('[data-rotate-handle]').attributes('aria-label')).toBe('Rotate')
      current!.api().select({ kind: 'element', componentIndex: 0, elementPath: [0] })
      await nextTick()
      expect(overlay().find('[data-rotate-handle]').exists()).toBe(false)
      current!.wrapper.unmount()
      await select(uiTwoComponents(), { kind: 'multi-component', componentIndexes: [0, 1] })
      expect(overlay().find('[data-rotate-handle]').exists()).toBe(false)
    })

    it('has no rotate handle for a layout-managed element or a video placeholder', async () => {
      const ui = {
        background: { color: 'FFFFFF' },
        components: [
          {
            id: 'c',
            position: { x: 0, y: 0 },
            elements: [
              {
                type: 'container',
                position: { x: 0, y: 0 },
                size: { width: 400, height: 200 },
                layout: { type: 'flex', direction: 'row' },
                elements: [{ type: 'text', size: { width: 100, height: 40 }, text: 'a', font: { family: 'Arial', size: 12, color: '000000' } }],
              },
            ],
          },
        ],
      } as unknown as RawUi
      await select(ui, { kind: 'element', componentIndex: 0, elementPath: [0, 0] })
      expect(overlay().find('[data-rotate-handle]').exists()).toBe(false)
      current!.wrapper.unmount()
      await select(uiWithVideoPlaceholder(), { kind: 'component', componentIndex: 1 })
      expect(overlay().find('[data-rotate-handle]').exists()).toBe(false)
    })

    it('rotating the handle 90° commits one Rotate with rotation 90', async () => {
      await select(uiWithText(), { kind: 'component', componentIndex: 0 })
      await rotateTo(90, [120, 150, 180])
      expect(editSlideUi).toHaveBeenCalledTimes(1)
      expect(editSlideUi.mock.calls[0]![2]).toBe('Rotate')
      const ui = editSlideUi.mock.calls[0]![1] as { components: { rotation: number }[] }
      expect(ui.components[0]!.rotation).toBeCloseTo(90)
    })

    it('previews on the layer, shows a badge, and clears the layer on release', async () => {
      await select(uiWithText(), { kind: 'component', componentIndex: 0 })
      await rotateTo(90, [135], {}, false)
      expect(layer().style.transform).toMatch(/^rotate\(45(\.\d+)?deg\)$/)
      expect(overlay().get('[data-rotate-badge]').text()).toBe('45°')
      expect(overlay().get('[data-selection-box]').attributes('style')).toContain('rotate(45')
      pointer(handle(), 'pointerup', at(135).x, at(135).y)
      await nextTick()
      expect(layer().style.transform).toBe('')
      expect(overlay().find('[data-rotate-badge]').exists()).toBe(false)
    })

    it('Shift snaps to 15° steps (37° -> 30°)', async () => {
      await select(uiWithText(), { kind: 'component', componentIndex: 0 })
      await rotateTo(0, [37], { shiftKey: true })
      const ui = editSlideUi.mock.calls[0]![1] as { components: { rotation: number }[] }
      expect(ui.components[0]!.rotation).toBe(30)
    })

    it('Escape mid-drag commits nothing and clears the layer transform', async () => {
      await select(uiWithText(), { kind: 'component', componentIndex: 0 })
      await rotateTo(90, [135], {}, false)
      expect(layer().style.transform).not.toBe('')
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await nextTick()
      expect(layer().style.transform).toBe('')
      expect(current!.api().gestureActive.value).toBe(false)
      pointer(handle(), 'pointerup', at(135).x, at(135).y)
      expect(editSlideUi).not.toHaveBeenCalled()
    })

    it('pointercancel cancels without a commit', async () => {
      await select(uiWithText(), { kind: 'component', componentIndex: 0 })
      await rotateTo(90, [135], {}, false)
      pointer(handle(), 'pointercancel', 0, 0)
      await nextTick()
      expect(layer().style.transform).toBe('')
      expect(editSlideUi).not.toHaveBeenCalled()
    })

    it('a slide change mid-gesture cancels it', async () => {
      await select(uiWithText(), { kind: 'component', componentIndex: 0 })
      await rotateTo(90, [135], {}, false)
      const grip = handle()
      current!.slide.value = tpl('b', uiWithText())
      await nextTick()
      expect(layer().style.transform).toBe('')
      pointer(grip, 'pointerup', at(135).x, at(135).y)
      expect(editSlideUi).not.toHaveBeenCalled()
    })

    it('wraps past 180°: 170° dragged 20° further commits -170 and never shows a value outside (-180, 180]', async () => {
      await select(rotated(170), { kind: 'component', componentIndex: 0 })
      // The handle sits 24px below the rotated box: press on it, then sweep another 20° clockwise.
      const start = 90 + 170
      const seen: number[] = []
      const from = at(start)
      pointer(handle(), 'pointerdown', from.x, from.y)
      for (let a = start + 5; a <= start + 20; a += 5) {
        const p = at(a)
        pointer(handle(), 'pointermove', p.x, p.y)
        await nextTick()
        seen.push(Number(overlay().get('[data-rotate-badge]').text().replace('°', '')))
      }
      const p = at(start + 20)
      pointer(handle(), 'pointerup', p.x, p.y)
      await nextTick()
      expect(seen.every((v) => v > -180 && v <= 180)).toBe(true)
      expect(seen).toContain(-175)
      const ui = editSlideUi.mock.calls[0]![1] as { components: { rotation: number }[] }
      expect(ui.components[0]!.rotation).toBeCloseTo(-170)
    })
  })
})
