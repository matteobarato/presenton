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

  it('finds an infographic and a layout root inside a component', () => {
    const u = ui({ type: 'flex', children: [{ type: 'text' }, { type: 'infographic' }] })
    const sel: Selection = { kind: 'component', componentIndex: 0 }
    expect(dataRoot(u, sel, 'infographic')).toEqual({ kind: 'element', componentIndex: 0, elementPath: [0, 1] })
    expect(dataRoot(u, sel, 'layout')).toEqual({ kind: 'element', componentIndex: 0, elementPath: [0] })
  })
  it('prefers a flex or grid over an enclosing container', () => {
    const u = ui({ type: 'container', child: { type: 'grid', children: [] } })
    expect(dataRoot(u, { kind: 'component', componentIndex: 0 }, 'layout')?.elementPath).toEqual([0, 0])
  })
  it('layout matches only flex, grid and container elements', () => {
    const at = (type: string) => dataRoot(ui({ type }), { kind: 'element', componentIndex: 0, elementPath: [0] }, 'layout')
    expect(at('flex')).not.toBeNull()
    expect(at('grid')).not.toBeNull()
    expect(at('container')).not.toBeNull()
    expect(at('group')).toBeNull()
    expect(at('list-view')).toBeNull()
    expect(dataRoot(ui({ type: 'group', children: [{ type: 'text' }] }), { kind: 'component', componentIndex: 0 }, 'layout')).toBeNull()
  })

  it('does not resolve a layout or infographic through a top-level group of a component', () => {
    const u = ui({ type: 'group', children: [{ type: 'flex', children: [{ type: 'infographic' }] }, { type: 'text' }] })
    const sel: Selection = { kind: 'component', componentIndex: 0 }
    expect(dataRoot(u, sel, 'layout')).toBeNull()
    expect(dataRoot(u, sel, 'infographic')).toBeNull()
    const beside = ui({ type: 'group', children: [{ type: 'grid', children: [] }] }, { type: 'container', child: { type: 'text' } })
    expect(dataRoot(beside, sel, 'layout')?.elementPath).toEqual([1])
  })
})
