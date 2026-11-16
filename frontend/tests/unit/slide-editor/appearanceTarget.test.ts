import { describe, expect, it } from 'vitest'
import { appearanceTargets, patchAppearanceInUi, readRotation, setRotationInUi } from '@/slide-editor/appearanceTarget'
import type { ElementSelection, RawUi } from '@/slide-editor/model'
import { uiTwoComponents, uiWithShape } from './fixtures'

const elSel: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }
const comp = { kind: 'component', componentIndex: 0 } as const

describe('appearanceTargets', () => {
  it('a one-element component rotates the component and styles its element', () => {
    expect(appearanceTargets(uiWithShape(), comp)).toEqual({ rotation: comp, style: elSel })
  })

  it('a group takes both on the component', () => {
    const ui = uiWithShape()
    const c = (ui.components as Array<{ elements: unknown[] }>)[0]!
    c.elements = [c.elements[0], c.elements[0]]
    expect(appearanceTargets(ui, comp)).toEqual({ rotation: comp, style: comp })
  })

  it('an element selection targets the element for both', () => {
    expect(appearanceTargets(uiWithShape(), elSel)).toEqual({ rotation: elSel, style: elSel })
  })

  it('multi and empty selections have no targets', () => {
    expect(appearanceTargets(uiTwoComponents(), { kind: 'multi-component', componentIndexes: [0, 1] })).toBeNull()
    expect(appearanceTargets(uiTwoComponents(), null)).toBeNull()
  })
})

describe('layout and infographic roots', () => {
  const ui = (...elements: Array<Record<string, unknown>>) => ({ components: [{ id: 'c', elements }] }) as unknown as RawUi

  it('styles the layout root of a component, and rotates the component', () => {
    const u = ui({ type: 'shape' }, { type: 'container', child: { type: 'text' } })
    const t = appearanceTargets(u, { kind: 'component', componentIndex: 0 })!
    expect(t.rotation).toEqual({ kind: 'component', componentIndex: 0 })
    expect(t.style).toEqual({ kind: 'element', componentIndex: 0, elementPath: [1] })
  })

  it('styles the infographic root of a component', () => {
    const u = ui({ type: 'flex', children: [{ type: 'infographic' }] })
    expect(appearanceTargets(u, { kind: 'component', componentIndex: 0 })!.style).toEqual({ kind: 'element', componentIndex: 0, elementPath: [0, 0] })
  })
})

describe('rotation and patch', () => {
  it('writes the normalised rotation and keeps unknown fields', () => {
    const ui = uiWithShape()
    ;(ui.components as Array<Record<string, unknown>>)[0]!.custom = 7
    const next = setRotationInUi(ui, comp, 270) as RawUi
    const c = (next.components as Array<Record<string, unknown>>)[0]!
    expect(c.rotation).toBe(-90)
    expect(c.custom).toBe(7)
    expect(readRotation(next, comp)).toBe(-90)
    expect(readRotation(ui, comp)).toBe(0)
  })

  it('patches an element record', () => {
    const next = patchAppearanceInUi(uiWithShape(), elSel, (r) => ({ ...r, opacity: 0.5 }))
    expect((next.components as Array<{ elements: Array<{ opacity: number }> }>)[0]!.elements[0]!.opacity).toBe(0.5)
  })
})
