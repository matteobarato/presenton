import { describe, expect, it } from 'vitest'
import { ROOT_ELEMENTS_COMPONENT_INDEX, componentBox, type ElementSelection, type RawUi } from '@/slide-editor/model'
import {
  addLayoutItem, alignmentChanges, applyLayoutChanges, fillChanges, gapChanges, layoutType, paddingChanges,
  radiusChanges, readContainer, readGap, removeLastLayoutItem, strokeChanges,
} from '@/slide-editor/layoutOps'

const box = { width: 200, height: 100 }

const text = (t: string) => ({
  type: 'text', position: { left: 0, top: 0 }, size: { width: 100, height: 50 }, content: t,
})
const flex = (children: unknown[]) => ({
  type: 'flex', direction: 'row', gap: 10, position: { left: 0, top: 0 },
  size: { width: 210, height: 50 }, children,
})
const ui = (): RawUi => ({
  components: [{ position: { x: 100, y: 100 }, size: { width: 210, height: 50 }, elements: [flex([text('a'), text('b')])] }],
  elements: [],
}) as unknown as RawUi
const sel: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }

describe('layoutOps reads and writes', () => {
  it('detects layout type', () => {
    expect(layoutType({ type: 'grid' })).toBe('grid')
    expect(layoutType({ type: 'text' })).toBeNull()
    expect(layoutType(null)).toBeNull()
  })

  it('gap', () => {
    expect(gapChanges(12.34)).toEqual({ gap: 12.3, column_gap: 12.3, row_gap: 12.3 })
    expect(gapChanges(-5)).toEqual({ gap: 0, column_gap: 0, row_gap: 0 })
    expect(readGap({ type: 'flex', column_gap: 8 })).toBe(8)
    expect(readGap({ type: 'flex', gap: 4, column_gap: 8 })).toBe(4)
    expect(readGap({ type: 'flex' })).toBe(0)
  })

  it('container read', () => {
    expect(readContainer({ type: 'container' }, box)).toMatchObject({
      fillColor: '#4a6ff3', fillOpacity: 1, strokeColor: '#1a1f36', strokeWidth: 0, strokeOpacity: 1,
      radius: 0, maxRadius: 50, horizontal: 'left', vertical: 'top', paddingX: 0, paddingY: 0,
    })
    expect(readContainer({ type: 'container', border_radius: 6 }, box).radius).toBe(6)
    expect(readContainer({ type: 'container', border_radius: { radius: 7 } }, box).radius).toBe(7)
    expect(readContainer({ type: 'container', border_radius: { tl: 8 } }, box).radius).toBe(8)
    expect(readContainer({ type: 'container', padding: { left: 4, right: 8 } }, box).paddingX).toBe(6)
    expect(readContainer({ type: 'container', fill: { color: 'FFAA00' } }, box).fillColor).toBe('#ffaa00')
  })

  it('container writes keep sibling keys and clamp', () => {
    expect(fillChanges({ type: 'container', fill: { color: '#111111', opacity: 0.5 } }, { color: '#222222' })).toEqual({ fill: { color: '#222222', opacity: 0.5 } })
    expect(strokeChanges({ type: 'container' }, { width: 40 })).toEqual({ stroke: { width: 32 } })
    expect(fillChanges({ type: 'container' }, { opacity: 1.4 })).toEqual({ fill: { opacity: 1 } })
    expect(radiusChanges(80, 50)).toEqual({ border_radius: { tl: 50, tr: 50, br: 50, bl: 50 } })
    expect(alignmentChanges({ type: 'container', alignment: { foo: 1 } }, 'center', 'middle')).toEqual({ alignment: { foo: 1, horizontal: 'center', vertical: 'middle' } })
    expect(paddingChanges({ type: 'container', padding: { top: 3 } }, 'x', 10)).toEqual({ padding: { top: 3, x: 10, left: 10, right: 10 } })
    expect(paddingChanges({ type: 'container' }, 'y', -2)).toEqual({ padding: { y: 0, top: 0, bottom: 0 } })
  })
})

describe('applyLayoutChanges', () => {
  it('addLayoutItem adds a child and grows the flex and its component', () => {
    const next = addLayoutItem(ui(), sel)!
    const comp = (next.components as Array<{ elements: Array<{ children: unknown[]; size: { width: number } }>; size?: unknown }>)[0]
    expect(comp.elements[0].children).toHaveLength(3)
    expect(comp.elements[0].size.width).toBeGreaterThan(210)
    expect(comp.size).toBeUndefined() // component box is derived from its children
    expect(componentBox(comp as never).width).toBeGreaterThan(210)
  })

  it('removeLastLayoutItem on an empty flex returns null', () => {
    const empty = { components: [{ position: { x: 0, y: 0 }, size: { width: 24, height: 24 }, elements: [flex([])] }], elements: [] } as unknown as RawUi
    expect(removeLastLayoutItem(empty, sel)).toBeNull()
  })

  it('updates ui.elements for a root-level layout', () => {
    const components: unknown[] = []
    const rootUi = { components, elements: [flex([text('a'), text('b')])] } as unknown as RawUi
    const root: ElementSelection = { kind: 'element', componentIndex: ROOT_ELEMENTS_COMPONENT_INDEX, elementPath: [0] }
    const next = applyLayoutChanges(rootUi, root, gapChanges(20))!
    expect((next.elements as Array<{ gap: number }>)[0].gap).toBe(20)
    expect(next.components).toBe(components)
  })

  it('returns null for a non-layout root', () => {
    const t = { components: [{ position: { x: 0, y: 0 }, elements: [text('a')] }], elements: [] } as unknown as RawUi
    expect(applyLayoutChanges(t, sel, { gap: 1 })).toBeNull()
  })
})
