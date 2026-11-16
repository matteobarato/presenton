import { describe, expect, it } from 'vitest'
import { isGroupSelection, selectionLabel, toolbarKind } from '@/slide-editor/toolbarKind'
import type { RawUi, Selection } from '@/slide-editor/model'

const ui = (...elements: Array<Record<string, unknown>>) => ({ components: [{ id: 'c', elements }] }) as unknown as RawUi
const comp: Selection = { kind: 'component', componentIndex: 0 }
const elAt = (path: number[]): Selection => ({ kind: 'element', componentIndex: 0, elementPath: path })
const el = elAt([0])

describe('toolbarKind', () => {
  it.each([
    [{ type: 'text' }, 'text', 'Text'],
    [{ type: 'text-list' }, 'list', 'List'],
    [{ type: 'image' }, 'image', 'Image'],
    [{ type: 'image', is_icon: true }, 'icon', 'Icon'],
    [{ type: 'image', isIcon: true }, 'icon', 'Icon'],
    [{ type: 'vector', closed: true }, 'shape', 'Shape'],
    [{ type: 'vector', closed: false }, 'line', 'Line'],
    [{ type: 'other' }, 'generic', 'Element'],
  ])('%j -> %s', (element, kind, label) => {
    for (const sel of [comp, el]) {
      expect(toolbarKind(ui(element), sel)).toBe(kind)
      expect(selectionLabel(ui(element), sel)).toBe(label)
    }
  })

  it('treats a multi-element component as generic', () => {
    expect(toolbarKind(ui({ type: 'text' }, { type: 'text' }), comp)).toBe('generic')
  })

  it('table and chart elements and components', () => {
    for (const [type, kind, label] of [['table', 'table', 'Table'], ['chart', 'chart', 'Chart']] as const) {
      expect(toolbarKind(ui({ type }), el)).toBe(kind)
      expect(selectionLabel(ui({ type }), el)).toBe(label)
    }
  })

  it('a component with a chart nested in a group is a chart, even beside other elements', () => {
    const u = ui({ type: 'text' }, { type: 'group', children: [{ type: 'chart' }] })
    expect(toolbarKind(u, comp)).toBe('chart')
    expect(selectionLabel(u, comp)).toBe('Chart')
  })

  it('labels a selected table cell "Cell"', () => {
    expect(selectionLabel(ui({ type: 'table' }), el, { row: 0, col: 1 })).toBe('Cell')
    expect(selectionLabel(ui({ type: 'table' }), el, null)).toBe('Table')
    expect(selectionLabel(ui({ type: 'chart' }), el, { row: 0, col: 0 })).toBe('Chart')
  })

  it('resolves a component in the order table, chart, infographic, layout', () => {
    expect(toolbarKind(ui({ type: 'flex', children: [{ type: 'infographic' }] }), comp)).toBe('infographic')
    expect(toolbarKind(ui({ type: 'flex', children: [{ type: 'chart' }, { type: 'infographic' }] }), comp)).toBe('chart')
    expect(toolbarKind(ui({ type: 'flex', children: [{ type: 'text' }] }), comp)).toBe('layout')
  })

  it('gives a selected child its own kind, not the parent layout', () => {
    expect(toolbarKind(ui({ type: 'flex', children: [{ type: 'text' }] }), elAt([0, 0]))).toBe('text')
  })

  it('labels layouts and infographics', () => {
    expect(selectionLabel(ui({ type: 'container' }), elAt([0]))).toBe('Container')
    expect(selectionLabel(ui({ type: 'flex', children: [] }), elAt([0]))).toBe('Flex layout')
    expect(selectionLabel(ui({ type: 'grid', children: [] }), elAt([0]))).toBe('Grid layout')
    expect(selectionLabel(ui({ type: 'infographic' }), elAt([0]))).toBe('Infographic')
  })

  it('keeps a group a Group', () => {
    expect(selectionLabel(ui({ type: 'text' }, { type: 'text' }), comp)).toBe('Group')
  })

  it('a component whose single element is a group holding a card stays a Group, not a layout', () => {
    const card = { type: 'flex', direction: 'row', position: { left: 0, top: 0 }, size: { width: 200, height: 50 }, children: [{ type: 'text', position: { left: 0, top: 0 }, size: { width: 90, height: 50 } }, { type: 'text', position: { left: 100, top: 0 }, size: { width: 90, height: 50 } }] }
    const g = { type: 'group', position: { left: 0, top: 0 }, size: { width: 200, height: 100 }, children: [card, { type: 'text', position: { left: 0, top: 60 }, size: { width: 200, height: 40 } }] }
    const u = { components: [{ id: 'c', position: { x: 0, y: 0 }, size: { width: 200, height: 100 }, elements: [g] }] } as unknown as RawUi
    expect(isGroupSelection(u, comp)).toBe(true)
    expect(toolbarKind(u, comp)).not.toBe('layout')
    expect(selectionLabel(u, comp)).toBe('Group')
  })
})
