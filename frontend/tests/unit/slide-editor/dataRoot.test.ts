import { describe, expect, it } from 'vitest'
import { dataRoot } from '@/slide-editor/dataRoot'
import type { RawUi, Selection } from '@/slide-editor/model'

const ui = (...elements: Array<Record<string, unknown>>) => ({ components: [{ id: 'c', elements }] }) as unknown as RawUi

describe('dataRoot', () => {
  it('returns the path to a chart nested in a component', () => {
    const u = ui({ type: 'text' }, { type: 'group', children: [{ type: 'text' }, { type: 'chart' }] })
    expect(dataRoot(u, { kind: 'component', componentIndex: 0 }, 'chart')).toEqual({
      kind: 'element',
      componentIndex: 0,
      elementPath: [1, 1],
    })
    expect(dataRoot(u, { kind: 'component', componentIndex: 0 }, 'table')).toBeNull()
  })

  it('returns an element selection of that type as itself', () => {
    const sel: Selection = { kind: 'element', componentIndex: 0, elementPath: [0] }
    expect(dataRoot(ui({ type: 'table' }), sel, 'table')).toEqual(sel)
    expect(dataRoot(ui({ type: 'table' }), sel, 'chart')).toBeNull()
  })

  it('is null for text, null selection, multi selection and no ui', () => {
    const sel: Selection = { kind: 'element', componentIndex: 0, elementPath: [0] }
    expect(dataRoot(ui({ type: 'text' }), sel, 'chart')).toBeNull()
    expect(dataRoot(ui({ type: 'chart' }), null, 'chart')).toBeNull()
    expect(dataRoot(ui({ type: 'chart' }), { kind: 'multi-component', componentIndexes: [0] }, 'chart')).toBeNull()
    expect(dataRoot(null, { kind: 'component', componentIndex: 0 }, 'chart')).toBeNull()
  })
})
