import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

const editSlideUi = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi }) }))

import type { ElementSelection, RawUi } from '@/slide-editor/model'
import { moveItems } from '@/components/editor/canvas/gestures'
import { mountEditable, pointer, stubRect, tpl } from './harness'

// A 3x2 table, 400x300 at (100,100): cells are 200x100. Rotation is on the component.
const tableUi = (rotation = 0, extra: Record<string, unknown> = {}): RawUi =>
  ({
    background: { color: 'FFFFFF' },
    components: [
      {
        id: 'c-table',
        position: { x: 100, y: 100 },
        ...(rotation ? { rotation } : {}),
        elements: [
          {
            type: 'table',
            position: { x: 0, y: 0 },
            size: { width: 400, height: 300 },
            columns: [{ runs: [{ text: 'a' }] }, { runs: [{ text: 'b' }] }],
            rows: [
              [{ runs: [{ text: 'c' }] }, { runs: [{ text: 'd' }] }],
              [{ runs: [{ text: 'e' }] }, { runs: [{ text: 'f' }] }],
            ],
            ...extra,
          },
        ],
      },
    ],
  }) as unknown as RawUi

let rect: ReturnType<typeof stubRect>
let current: ReturnType<typeof mountEditable> | null = null
const overlay = () => current!.wrapper.get('[data-testid="selection-overlay"]')
const click = (x: number, y: number) => {
  pointer(overlay().element, 'pointerdown', x, y)
  pointer(overlay().element, 'pointerup', x, y)
}

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

describe('SelectionOverlay table cells', () => {
  it('a first click selects the table component and no cell', async () => {
    current = mountEditable(tpl('a', tableUi()))
    click(400, 250)
    await nextTick()
    expect(current.api().selection.value).toEqual({ kind: 'component', componentIndex: 0 })
    expect(current.api().tableCell.value).toBeNull()
    expect(overlay().find('[data-table-cell-outline]').exists()).toBe(false)
  })

  it('a second click selects the cell under the pointer and outlines it', async () => {
    current = mountEditable(tpl('a', tableUi()))
    click(400, 250)
    click(400, 250)
    await nextTick()
    const root = { kind: 'element', componentIndex: 0, elementPath: [0] }
    expect(current.api().tableCell.value).toEqual({ root, row: 1, col: 1 })
    const outline = overlay().get('[data-table-cell-outline][data-row="1"][data-col="1"]')
    expect(outline.attributes('style')).toContain('left: 23.4375%') // cell x 300 of 1280
    expect(outline.classes().join(' ')).toContain('border-[#4bb3e6]')
    expect(outline.classes().join(' ')).toContain('border-2')
  })

  it('a second press dragged past the threshold moves the table and keeps the cell', async () => {
    current = mountEditable(tpl('a', tableUi()))
    click(400, 250)
    click(200, 150)
    await nextTick()
    const before = current.api().tableCell.value
    pointer(overlay().element, 'pointerdown', 400, 250)
    pointer(overlay().element, 'pointermove', 500, 250)
    pointer(overlay().element, 'pointerup', 500, 250)
    await nextTick()
    expect(editSlideUi).toHaveBeenCalled()
    expect(current.api().tableCell.value).toEqual(before)
  })

  it('selects the cell under a rotated table', async () => {
    current = mountEditable(tpl('a', tableUi(90)))
    // Cell (0,0) centre (200,150) turns 90deg about the table centre (300,250) to (400,150).
    click(300, 250)
    click(400, 150)
    await nextTick()
    expect(current.api().tableCell.value).toMatchObject({ row: 0, col: 0 })
    expect(overlay().find('[data-table-cell-outline][data-row="0"][data-col="0"]').attributes('style')).toContain(
      'rotate(90deg)',
    )
  })

  it('a table that cannot move still gets cell selection', async () => {
    const ui = {
      components: [
        {
          id: 'c',
          position: { x: 100, y: 100 },
          elements: [
            {
              type: 'container',
              position: { x: 0, y: 0 },
              size: { width: 400, height: 300 },
              children: [
                {
                  type: 'table',
                  size: { width: 400, height: 300 },
                  columns: [{ runs: [{ text: 'a' }] }, { runs: [{ text: 'b' }] }],
                  rows: [[{ runs: [{ text: 'c' }] }, { runs: [{ text: 'd' }] }], [{ runs: [{ text: 'e' }] }, { runs: [{ text: 'f' }] }]],
                },
              ],
            },
          ],
        },
      ],
    } as unknown as RawUi
    current = mountEditable(tpl('a', ui))
    const sel: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0, 0] }
    expect(moveItems(sel, ui)).toEqual([])
    current.api().select(sel)
    await nextTick()
    click(400, 250)
    await nextTick()
    expect(current.api().selection.value).toEqual(sel)
    expect(current.api().tableCell.value).toMatchObject({ row: 1, col: 1 })
  })
})
