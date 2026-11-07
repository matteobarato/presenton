import { describe, expect, it } from 'vitest'
import { applyResize, planMove, withShiftedPosition } from '@/components/editor/canvas/gestures'
import type { ElementSelection, RawUi } from '@/slide-editor/model'
import { rotatePoint, selectionFrame, type Frame, type Handle } from '@/slide-editor/rotation'
import { uiWithText } from '../../slide-editor/fixtures'

const rotated = (deg: number): RawUi => {
  const ui = uiWithText() as unknown as { components: Record<string, unknown>[] }
  ui.components[0]!.rotation = deg
  return ui as unknown as RawUi
}
const comp = { kind: 'component', componentIndex: 0 } as const

// Screen position of a handle point (fractions of the unrotated box) of a frame.
function corner(frame: Frame, fx: number, fy: number) {
  const { box } = frame
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  return rotatePoint({ x: box.x + box.width * fx, y: box.y + box.height * fy }, centre, frame.rotation)
}

describe('applyResize with rotation', () => {
  it.each([45, 90, -30])('dragging se by (50, 0) at %i° keeps the nw corner on screen', (deg) => {
    const ui = rotated(deg)
    const before = corner(selectionFrame(ui, comp)!, 0, 0)
    const next = applyResize(ui, comp, 'se', { x: 50, y: 0 }, false)
    const frame = selectionFrame(next, comp)!
    const after = corner(frame, 0, 0)
    expect(after.x).toBeCloseTo(before.x, 4)
    expect(after.y).toBeCloseTo(before.y, 4)
    // The pointer moved 50px right on screen; along the box's own axis that is 50·cos(deg).
    expect(frame.box.width).toBeCloseTo(400 + 50 * Math.cos((deg * Math.PI) / 180), 4)
  })

  it.each<Handle>(['nw', 'ne', 'sw', 'n', 'w'])('keeps the opposite point still dragging %s at 45°', (handle) => {
    const ui = rotated(45)
    const opposite: Record<string, [number, number]> = { nw: [1, 1], ne: [0, 1], sw: [1, 0], n: [0.5, 1], w: [1, 0.5] }
    const [fx, fy] = opposite[handle]!
    const before = corner(selectionFrame(ui, comp)!, fx, fy)
    const after = corner(selectionFrame(applyResize(ui, comp, handle, { x: -20, y: 30 }, false), comp)!, fx, fy)
    expect(after.x).toBeCloseTo(before.x, 4)
    expect(after.y).toBeCloseTo(before.y, 4)
  })

  it('is unchanged without rotation', () => {
    const next = applyResize(uiWithText(), comp, 'se', { x: 50, y: 0 }, false)
    const frame = selectionFrame(next, comp)!
    expect(frame.box).toMatchObject({ x: 100, y: 80, width: 450 })
  })

  it('keeps unknown keys of the position when it shifts', () => {
    const shifted = withShiftedPosition({ position: { x: 1, y: 2, extra: 'keep' } }, { x: 10, y: 20 })
    expect(shifted.position).toEqual({ x: 11, y: 22, extra: 'keep' })
  })

  it('keeps the opposite corner of a rotated element inside an unrotated component', () => {
    const ui = uiWithText() as unknown as { components: { elements: Record<string, unknown>[] }[] }
    ui.components[0]!.elements[0]!.rotation = 30
    const sel: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }
    const before = corner(selectionFrame(ui as unknown as RawUi, sel)!, 0, 0)
    const next = applyResize(ui as unknown as RawUi, sel, 'se', { x: 40, y: 10 }, false)
    const after = corner(selectionFrame(next, sel)!, 0, 0)
    expect(after.x).toBeCloseTo(before.x, 4)
    expect(after.y).toBeCloseTo(before.y, 4)
  })
})

describe('applyResize under a rotated ancestor', () => {
  it('keeps the nw corner of a 20° element in a 30° component still on screen', () => {
    const ui = rotated(30) as unknown as { components: { elements: Record<string, unknown>[] }[] }
    ui.components[0]!.elements[0]!.rotation = 20
    const sel: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }
    const frame0 = selectionFrame(ui as unknown as RawUi, sel)!
    expect(frame0.rotation).toBeCloseTo(50)
    const before = corner(frame0, 0, 0)
    const next = applyResize(ui as unknown as RawUi, sel, 'se', { x: 40, y: 25 }, false)
    const frame1 = selectionFrame(next, sel)!
    expect(frame1.box.width).not.toBeCloseTo(frame0.box.width)
    const after = corner(frame1, 0, 0)
    expect(Math.abs(after.x - before.x)).toBeLessThan(1e-6)
    expect(Math.abs(after.y - before.y)).toBeLessThan(1e-6)
  })
})

describe('planMove with rotation', () => {
  it('snaps the axis-aligned bounds of a rotated component', () => {
    const plan = planMove(rotated(90), [{ kind: 'component', index: 0 }])!
    // 400×120 at (100,80), centre (300,140), turned 90°: 120 wide, 400 tall.
    expect(plan.startBox.x).toBeCloseTo(240)
    expect(plan.startBox.y).toBeCloseTo(-60)
    expect(plan.startBox.width).toBeCloseTo(120)
    expect(plan.startBox.height).toBeCloseTo(400)
  })
})
