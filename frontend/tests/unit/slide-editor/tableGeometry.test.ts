import { describe, expect, it } from 'vitest'
import { cellAtPoint, cellBox, cellFrame } from '@/slide-editor/tableGeometry'
import type { Frame } from '@/slide-editor/rotation'

const box = { x: 0, y: 0, width: 300, height: 200 }

describe('cellBox', () => {
  it('splits the box evenly', () => {
    expect(cellBox(box, 2, 3, { row: 1, col: 2 })).toEqual({ x: 200, y: 100, width: 100, height: 100 })
  })
})

describe('cellAtPoint', () => {
  const frame: Frame = { box, rotation: 0 }
  it('finds the cell and returns null outside', () => {
    expect(cellAtPoint(frame, 2, 3, { x: 250, y: 150 })).toEqual({ row: 1, col: 2 })
    expect(cellAtPoint(frame, 2, 3, { x: 301, y: 10 })).toBeNull()
  })
  it('maps right and bottom edges to the last column and row', () => {
    expect(cellAtPoint(frame, 2, 3, { x: 300, y: 200 })).toEqual({ row: 1, col: 2 })
  })
  it('respects rotation', () => {
    const rotated: Frame = { box, rotation: 90 }
    const f = cellFrame(rotated, 2, 3, { row: 0, col: 0 })
    const c = { x: f.box.x + f.box.width / 2, y: f.box.y + f.box.height / 2 }
    expect(c.x).toBeCloseTo(200, 6)
    expect(c.y).toBeCloseTo(0, 6)
    expect(cellAtPoint(rotated, 2, 3, c)).toEqual({ row: 0, col: 0 })
    expect(cellAtPoint(rotated, 2, 3, { x: 50, y: 50 })).not.toEqual({ row: 0, col: 0 })
    expect(f.rotation).toBe(90)
  })
})
