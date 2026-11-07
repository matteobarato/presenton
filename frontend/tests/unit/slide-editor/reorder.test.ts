/* eslint-disable @typescript-eslint/no-explicit-any -- loose ui shapes */
import { describe, expect, it } from 'vitest'
import type { RawUi } from '@/slide-editor/model'
import { reorderSelection } from '@/slide-editor/ops'
import { selectionLabel, toolbarKind } from '@/slide-editor/toolbarKind'

const box = (x = 0) => ({ position: { x, y: 0 }, size: { width: 100, height: 100 } })
const ui = (): RawUi =>
  ({
    components: [
      { id: 'a', ...box(), elements: [{ type: 'text', ...box(), text: 'a' }] },
      { id: 'b', ...box(), elements: [{ type: 'image', data: '/b.png', ...box() }] },
      {
        id: 'c',
        ...box(),
        elements: [
          { type: 'text', id: 'c0', ...box(), text: 'c0' },
          { type: 'group', id: 'g', ...box(), children: [{ type: 'text', id: 'g0', ...box() }, { type: 'text', id: 'g1', ...box() }] },
        ],
      },
    ],
  }) as RawUi
const ids = (u: RawUi) => (u.components as any[]).map((c) => c.id)

describe('reorderSelection', () => {
  it('moves a component one step or to the ends, selecting it at its new index', () => {
    const fwd = reorderSelection(ui(), { kind: 'component', componentIndex: 0 }, 'bring-forward')!
    expect(ids(fwd.ui)).toEqual(['b', 'a', 'c'])
    expect(fwd.selection).toEqual({ kind: 'component', componentIndex: 1 })
    expect(ids(reorderSelection(ui(), { kind: 'component', componentIndex: 0 }, 'bring-to-front')!.ui)).toEqual(['b', 'c', 'a'])
    expect(ids(reorderSelection(ui(), { kind: 'component', componentIndex: 2 }, 'send-to-back')!.ui)).toEqual(['c', 'a', 'b'])
    expect(ids(reorderSelection(ui(), { kind: 'component', componentIndex: 2 }, 'send-backward')!.ui)).toEqual(['a', 'c', 'b'])
  })

  it('is a no-op at the top or bottom and for multi-selections', () => {
    expect(reorderSelection(ui(), { kind: 'component', componentIndex: 2 }, 'bring-forward')).toBeNull()
    expect(reorderSelection(ui(), { kind: 'component', componentIndex: 0 }, 'send-to-back')).toBeNull()
    expect(reorderSelection(ui(), { kind: 'multi-component', componentIndexes: [0, 1] }, 'bring-forward')).toBeNull()
    expect(reorderSelection(ui(), null, 'bring-forward')).toBeNull()
  })

  it('moves the component of a lone element', () => {
    const r = reorderSelection(ui(), { kind: 'element', componentIndex: 1, elementPath: [0] }, 'bring-to-front')!
    expect(ids(r.ui)).toEqual(['a', 'c', 'b'])
    expect(r.selection).toEqual({ kind: 'element', componentIndex: 2, elementPath: [0] })
  })

  it('moves an element among its siblings', () => {
    const r = reorderSelection(ui(), { kind: 'element', componentIndex: 2, elementPath: [0] }, 'bring-forward')!
    expect((r.ui.components as any[])[2].elements.map((e: any) => e.id)).toEqual(['g', 'c0'])
    expect(r.selection).toEqual({ kind: 'element', componentIndex: 2, elementPath: [1] })
    const nested = reorderSelection(ui(), { kind: 'element', componentIndex: 2, elementPath: [1, 1] }, 'send-to-back')!
    expect((nested.ui.components as any[])[2].elements[1].children.map((e: any) => e.id)).toEqual(['g1', 'g0'])
    expect(nested.selection).toEqual({ kind: 'element', componentIndex: 2, elementPath: [1, 0] })
  })

  it('leaves children of a layout alone: their order is their position', () => {
    const u = ui()
    ;(u.components as any[])[2].elements[1] = {
      type: 'flex',
      direction: 'row',
      ...box(),
      children: [{ type: 'text', ...box() }, { type: 'text', ...box() }],
    }
    expect(reorderSelection(u, { kind: 'element', componentIndex: 2, elementPath: [1, 0] }, 'bring-forward')).toBeNull()
  })
})

describe('video placeholder kind', () => {
  it('is a video, not an image', () => {
    const u = ui()
    ;(u.components as any[])[1].elements[0].video_placeholder = true
    expect(toolbarKind(u, { kind: 'component', componentIndex: 1 })).toBe('video')
    expect(toolbarKind(u, { kind: 'element', componentIndex: 1, elementPath: [0] })).toBe('video')
    expect(selectionLabel(u, { kind: 'component', componentIndex: 1 })).toBe('Video')
  })
})
