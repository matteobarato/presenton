import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHADOW,
  isOpenVector,
  normalizeRotation,
  readAppearance,
  readListMarker,
  readMarkers,
  readShapeStyle,
  setCornerRadius,
  setCurve,
  setDash,
  setFill,
  setFlip,
  setIcon,
  setListMarker,
  setMarkers,
  setOpacity,
  setStroke,
  swapMarkers,
} from '@/slide-editor/elementStyle'

const rect = {
  type: 'vector',
  points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }],
  keep: 'x',
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const strokeOf = (el: any) => el.stroke

describe('elementStyle', () => {
  it('reads old-editor defaults when fill/stroke/shadow are absent', () => {
    const s = readShapeStyle(rect)
    expect(s.fill).toEqual({ color: '#FFFFFF', opacity: 1 }); expect(s.fillEnabled).toBe(false)
    expect(s.stroke).toMatchObject({ color: '#1A1A1A', opacity: 1, width: 1.5 })
  })
  it('only closed 4-point polygons round corners; radius capped at min(128,w/2,h/2)', () => {
    expect(readShapeStyle(rect)).toMatchObject({ canRoundCorners: true, maxRadius: 25 })
    expect(readShapeStyle({ ...rect, closed: false }).canRoundCorners).toBe(false)
    expect(setCornerRadius(rect, 10).corner_radii).toEqual([10, 10, 10, 10])
  })
  it('isOpenVector: open polygon only', () => {
    expect(isOpenVector({ type: 'vector', closed: false, points: [] })).toBe(true)
    expect(isOpenVector({ type: 'vector', points: [] })).toBe(false)
    expect(isOpenVector({ type: 'vector', shape: 'ellipse', closed: false, points: [] })).toBe(false)
  })
  it('dash arrays scale with width; solid clears; width change rescales', () => {
    const w2 = setStroke(rect, { width: 2 })
    expect(strokeOf(setDash(w2, 'dashed'))).toMatchObject({ dash: [6, 4] })
    expect(strokeOf(setDash(w2, 'dotted'))).toMatchObject({ dash: [2, 3], line_cap: 'round' })
    expect(strokeOf(setDash(setDash(w2, 'dashed'), 'solid')).dash).toBeNull()
    expect(strokeOf(setStroke(setDash(w2, 'dashed'), { width: 4 })).dash).toEqual([12, 8])
    expect(readShapeStyle(setDash(w2, 'dotted')).dash).toBe('dotted')
  })
  it('fill/stroke off writes null; unknown fields survive', () => {
    expect(setFill(rect, null)).toMatchObject({ fill: null, keep: 'x' })
    expect(setStroke(rect, null)).toMatchObject({ stroke: null, keep: 'x' })
  })
  it('curve smooth/none', () => {
    expect(setCurve(rect, 'smooth').curve).toMatchObject({ type: 'smooth' })
    expect(setCurve(setCurve(rect, 'smooth'), 'none').curve).toBeNull()
  })
  it('markers are top-level fields; swap swaps', () => {
    const line = setMarkers({ type: 'vector', closed: false, points: [] }, 'none', 'arrow')
    expect(line).toMatchObject({ start_marker: 'none', end_marker: 'arrow' })
    expect(readMarkers(swapMarkers(line))).toEqual({ start: 'arrow', end: 'none' })
  })
  it('normalizeRotation', () => {
    expect(normalizeRotation(270)).toBe(-90); expect(normalizeRotation(-180)).toBe(180)
    expect(normalizeRotation(540)).toBe(180); expect(normalizeRotation(12.345)).toBe(12.3)
  })
  it('list marker read/write', () => {
    expect(readListMarker({ type: 'text-list' })).toBe('bullet')
    expect(setListMarker({ type: 'text-list' }, 'number').marker).toBe('number')
  })
  it('setIcon writes data and icon_type and keeps color', () => {
    expect(setIcon({ type: 'image', is_icon: true, color: '#ff0000', data: 'a' }, '/static/icons/bold/x-bold.png', 'bold'))
      .toMatchObject({ data: '/static/icons/bold/x-bold.png', icon_type: 'bold', color: '#ff0000' })
  })
  it('appearance: opacity clamps 0..1, flip toggles, shadow default/null', () => {
    expect(setOpacity(rect, 1.4).opacity).toBe(1)
    expect(setFlip(setFlip(rect, 'h'), 'h').flip_h).toBe(false)
    expect(readAppearance(rect).shadow).toEqual(DEFAULT_SHADOW)
  })
})

import { normalizeRotation as normalizeRotationRange } from '@/slide-editor/elementStyle'
describe('normalizeRotation range', () => {
  it('maps values that round to -180 to 180', () => {
    expect(normalizeRotationRange(-179.96)).toBe(180)
    expect(normalizeRotationRange(-180)).toBe(180)
    expect(normalizeRotationRange(180.04)).toBe(180)
    expect(normalizeRotationRange(190)).toBe(-170)
  })
})
