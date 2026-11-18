import { describe, expect, it } from 'vitest'
import { floatingAnchor, type AnchorInput } from '@/components/editor/canvas/floating/floatingAnchor'

const base = { viewport: { width: 1000, height: 600 }, bar: { width: 300, height: 36 }, margin: 8 }
const at = (target: AnchorInput['target']) => floatingAnchor({ ...base, target })

describe('floatingAnchor', () => {
  it('centres the bar above the target', () => {
    expect(at({ x: 400, y: 200, width: 200, height: 100 })).toEqual({ x: 350, y: 154, placement: 'above' })
  })

  it('flips below when above does not fit, clearing the rotate handle', () => {
    const target = { x: 400, y: 20, width: 200, height: 100 }
    const r = at(target)
    expect(r.placement).toBe('below')
    expect(r.y).toBe(target.y + target.height + 44)
  })

  it('clamps horizontally to the margin', () => {
    expect(at({ x: 0, y: 200, width: 40, height: 40 }).x).toBe(8)
    const right = at({ x: 960, y: 200, width: 40, height: 40 })
    expect(right.x + 300).toBe(992)
  })

  it('pins to the top margin when neither side fits', () => {
    const r = at({ x: 100, y: 0, width: 200, height: 600 })
    expect(r).toMatchObject({ y: 8, placement: 'pinned' })
  })

  it('stays finite and inside the viewport for a target scrolled off the top', () => {
    const r = at({ x: 400, y: -300, width: 200, height: 250 })
    expect(Number.isFinite(r.x) && Number.isFinite(r.y)).toBe(true)
    expect(r.x).toBeGreaterThanOrEqual(8)
    expect(r.y).toBeGreaterThanOrEqual(8)
    expect(r.y + 36).toBeLessThanOrEqual(592)
  })

  it('uses the margin when the bar is wider than the viewport', () => {
    const r = floatingAnchor({ ...base, bar: { width: 1200, height: 36 }, target: { x: 400, y: 200, width: 200, height: 100 } })
    expect(r.x).toBe(8)
  })
})
