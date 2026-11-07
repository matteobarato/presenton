import { describe, expect, it } from 'vitest'
import {
  aabb,
  pointInFrame,
  rotatedResizeShift,
  rotatePoint,
  selectionFrame,
  type Frame,
  type Handle,
} from '@/slide-editor/rotation'
import { selectionFrames } from '@/slide-editor/geometry'
import type { Box, ElementSelection, Point, RawUi } from '@/slide-editor/model'

const near = (a: Point, b: Point) => {
  expect(a.x).toBeCloseTo(b.x, 6)
  expect(a.y).toBeCloseTo(b.y, 6)
}

const backdrop = { type: 'shape', position: { x: 0, y: 0 }, size: { width: 200, height: 100 } }
const child = (extra: Record<string, unknown> = {}) => ({
  type: 'shape',
  position: { x: 0, y: 0 },
  size: { width: 50, height: 50 },
  ...extra,
})
const ui = (component: Record<string, unknown>) =>
  ({ components: [{ position: { x: 0, y: 0 }, ...component }] }) as unknown as RawUi

describe('rotatePoint', () => {
  it('rotates clockwise on screen', () => {
    near(rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90), { x: 0, y: 10 })
  })
})

describe('pointInFrame', () => {
  const frame: Frame = { box: { x: 100, y: 100, width: 200, height: 100 }, rotation: 90 }
  it('follows the rotated shape, not its AABB', () => {
    expect(pointInFrame(frame, { x: 200, y: 150 })).toBe(true)
    expect(pointInFrame(frame, { x: 200, y: 60 })).toBe(true)
    expect(pointInFrame(frame, { x: 110, y: 110 })).toBe(false)
  })
})

describe('selectionFrame', () => {
  const rotated = (extra: Record<string, unknown> = {}) =>
    ui({ rotation: 90, elements: [backdrop, child(extra)] })

  it('places a child of a rotated component where the renderer draws it', () => {
    const f = selectionFrame(rotated(), { kind: 'element', componentIndex: 0, elementPath: [1] })!
    near({ x: f.box.x + f.box.width / 2, y: f.box.y + f.box.height / 2 }, rotatePoint({ x: 25, y: 25 }, { x: 100, y: 50 }, 90))
    expect(f.box.width).toBe(50)
    expect(f.box.height).toBe(50)
    expect(f.rotation).toBe(90)
  })

  it('adds nested angles', () => {
    const f = selectionFrame(
      ui({ rotation: 45, elements: [backdrop, child({ rotation: 30 })] }),
      { kind: 'element', componentIndex: 0, elementPath: [1] },
    )!
    expect(f.rotation).toBe(75)
  })

  it('negates the child angle under an odd flip, keeps it under two', () => {
    const sel: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [1] }
    expect(selectionFrame(ui({ rotation: 45, flip_h: true, elements: [backdrop, child({ rotation: 30 })] }), sel)!.rotation).toBe(15)
    expect(selectionFrame(ui({ rotation: 45, flip_h: true, flip_v: true, elements: [backdrop, child({ rotation: 30 })] }), sel)!.rotation).toBe(75)
  })

  it('mirrors the centre across a flipped parent before rotating', () => {
    const f = selectionFrame(
      ui({ flip_h: true, elements: [backdrop, child()] }),
      { kind: 'element', componentIndex: 0, elementPath: [1] },
    )!
    near({ x: f.box.x + f.box.width / 2, y: f.box.y + f.box.height / 2 }, { x: 175, y: 25 })
  })

  it('walks through a rotated group too', () => {
    const group = {
      type: 'group',
      position: { x: 0, y: 0 },
      size: { width: 200, height: 100 },
      rotation: 90,
      children: [child({ position: { x: 150, y: 50 }, rotation: 10 })],
    }
    const f = selectionFrame(ui({ elements: [group] }), { kind: 'element', componentIndex: 0, elementPath: [0, 0] })!
    near({ x: f.box.x + f.box.width / 2, y: f.box.y + f.box.height / 2 }, rotatePoint({ x: 175, y: 75 }, { x: 100, y: 50 }, 90))
    expect(f.rotation).toBe(100)
  })

  it('equals the plain box when nothing rotates', () => {
    const f = selectionFrame(ui({ elements: [backdrop, child()] }), { kind: 'component', componentIndex: 0 })!
    expect(f).toEqual({ box: { x: 0, y: 0, width: 200, height: 100 }, rotation: 0 })
  })

  it('gives one frame per component for a multi selection', () => {
    const two = {
      components: [
        { position: { x: 0, y: 0 }, rotation: 20, elements: [backdrop] },
        { position: { x: 300, y: 0 }, elements: [backdrop] },
      ],
    } as unknown as RawUi
    const frames = selectionFrames(two, { kind: 'multi-component', componentIndexes: [0, 1] })
    expect(frames.map((f) => f.rotation)).toEqual([20, 0])
  })
})

describe('aabb', () => {
  it('bounds the rotated frame about its centre', () => {
    const b = aabb({ box: { x: 100, y: 100, width: 200, height: 100 }, rotation: 90 })
    expect(b.x).toBeCloseTo(150)
    expect(b.y).toBeCloseTo(50)
    expect(b.width).toBeCloseTo(100)
    expect(b.height).toBeCloseTo(200)
  })
})

// Same contract as gestures.resizedBox (the edge opposite the handle stays put), without its import graph.
function resizedBox(box: Box, handle: Handle, delta: Point): Box {
  const west = handle.includes('w')
  const north = handle.startsWith('n')
  const width = handle === 'n' || handle === 's' ? box.width : box.width + (west ? -delta.x : delta.x)
  const height = handle === 'e' || handle === 'w' ? box.height : box.height + (north ? -delta.y : delta.y)
  return {
    x: west ? box.x + box.width - width : box.x,
    y: north ? box.y + box.height - height : box.y,
    width,
    height,
  }
}

describe('rotatedResizeShift', () => {
  const screen = (box: Box, rotation: number, p: Point) =>
    rotatePoint(p, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, rotation)
  const handles: Handle[] = ['se', 'e', 's', 'nw', 'w', 'n', 'ne', 'sw']
  const opposite: Record<Handle, Point> = {
    se: { x: 0, y: 0 }, nw: { x: 1, y: 1 }, e: { x: 0, y: 0.5 }, w: { x: 1, y: 0.5 },
    s: { x: 0.5, y: 0 }, n: { x: 0.5, y: 1 }, ne: { x: 0, y: 1 }, sw: { x: 1, y: 0 },
  }
  it.each([0, 30, 90, -135])('keeps the opposite handle still at rotation %i', (rotation) => {
    for (const handle of handles) {
      const source: Box = { x: 100, y: 50, width: 200, height: 120 }
      const next = resizedBox(source, handle, { x: 37, y: -23 })
      const at = (b: Box) => ({ x: b.x + opposite[handle].x * b.width, y: b.y + opposite[handle].y * b.height })
      const before = screen(source, rotation, at(source))
      const shift = rotatedResizeShift(source, next, handle, rotation)
      const moved = { ...next, x: next.x + shift.x, y: next.y + shift.y }
      near(screen(moved, rotation, at(moved)), before)
    }
  })
})
