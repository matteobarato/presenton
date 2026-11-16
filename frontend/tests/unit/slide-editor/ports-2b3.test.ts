import { describe, expect, it } from 'vitest'
import { addLayoutItemChanges, removeLastLayoutItemChanges, resizedInfographicFrame } from '@/slide-editor/model'

describe('2b-3 ports', () => {
  it('adds and removes a flex item', () => {
    const flex = { type: 'flex', children: [{ type: 'text', name: 'a' }] }
    expect((addLayoutItemChanges(flex).children as unknown[]).length).toBe(2)
    expect((removeLastLayoutItemChanges(flex)!.children as unknown[]).length).toBe(0)
    expect(removeLastLayoutItemChanges({ type: 'flex', children: [] })).toBeNull()
  })
  it('resizedInfographicFrame is empty when the natural size is unchanged', () => {
    const el = { type: 'infographic', position: { x: 0, y: 0 }, size: { width: 400, height: 300 }, data: { type: 'vertical_funnel', items: [{ value: 1 }] } }
    expect(resizedInfographicFrame(el, el.data)).toEqual({})
  })
})
