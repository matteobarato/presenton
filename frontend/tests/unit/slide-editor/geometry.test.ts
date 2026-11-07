import { describe, expect, it } from 'vitest'
import {
  hitComponent,
  hitDeepest,
  selectionBoxes,
  toSlidePoint,
} from '@/slide-editor/geometry'
import {
  uiOverlapping,
  uiTwoComponents,
  uiWithDecorativeBackground,
  uiWithVideoPlaceholder,
} from './fixtures'

describe('hitComponent', () => {
  it('finds the component under the point', () => {
    expect(hitComponent(uiTwoComponents(), { x: 150, y: 100 })).toEqual({ kind: 'component', componentIndex: 0 })
    expect(hitComponent(uiTwoComponents(), { x: 700, y: 250 })).toEqual({ kind: 'component', componentIndex: 1 })
  })
  it('returns null over empty background', () => {
    expect(hitComponent(uiTwoComponents(), { x: 5, y: 5 })).toBeNull()
  })
  it('skips decorative full-slide root vectors', () => {
    expect(hitComponent(uiWithDecorativeBackground(), { x: 5, y: 5 })).toBeNull()
    expect(hitComponent(uiWithDecorativeBackground(), { x: 150, y: 100 })).toEqual({ kind: 'component', componentIndex: 0 })
  })
  it('hits a non-decorative root element', () => {
    const ui = {
      elements: [{ type: 'text', position: { x: 10, y: 10 }, size: { width: 50, height: 50 }, text: 'r' }],
      components: [],
    } as never
    expect(hitComponent(ui, { x: 20, y: 20 })).toEqual({ kind: 'element', componentIndex: -1, elementPath: [0] })
  })
  it('prefers the later component where they overlap', () => {
    expect(hitComponent(uiOverlapping(), { x: 200, y: 150 })).toEqual({ kind: 'component', componentIndex: 1 })
    expect(hitComponent(uiOverlapping(), { x: 110, y: 90 })).toEqual({ kind: 'component', componentIndex: 0 })
  })
  it('skips the video placeholder layer', () => {
    expect(hitComponent(uiWithVideoPlaceholder(), { x: 1000, y: 500 })).toBeNull()
  })
})

describe('hitDeepest', () => {
  it('returns the element under the point', () => {
    expect(hitDeepest(uiTwoComponents(), { x: 150, y: 100 })).toEqual({
      kind: 'element',
      componentIndex: 0,
      elementPath: [0],
    })
  })
  it('returns null outside any component or video placeholder', () => {
    expect(hitDeepest(uiTwoComponents(), { x: 5, y: 5 })).toBeNull()
    expect(hitDeepest(uiWithVideoPlaceholder(), { x: 1000, y: 500 })).toBeNull()
  })
  it('descends into nested children', () => {
    const ui = {
      components: [
        {
          position: { x: 100, y: 100 },
          elements: [
            {
              type: 'group',
              position: { x: 0, y: 0 },
              size: { width: 300, height: 300 },
              children: [
                { type: 'text', position: { x: 10, y: 10 }, size: { width: 50, height: 50 }, text: 'a' },
                { type: 'text', position: { x: 100, y: 100 }, size: { width: 50, height: 50 }, text: 'b' },
              ],
            },
          ],
        },
      ],
    } as never
    expect(hitDeepest(ui, { x: 220, y: 220 })).toEqual({ kind: 'element', componentIndex: 0, elementPath: [0, 1] })
    expect(hitDeepest(ui, { x: 350, y: 350 })).toEqual({ kind: 'element', componentIndex: 0, elementPath: [0] })
  })
})

describe('selectionBoxes', () => {
  it('returns component and element boxes', () => {
    const ui = uiTwoComponents()
    expect(selectionBoxes(ui, { kind: 'component', componentIndex: 1 })).toEqual([{ x: 600, y: 200, width: 300, height: 200 }])
    expect(selectionBoxes(ui, { kind: 'element', componentIndex: 0, elementPath: [0] })).toEqual([
      { x: 100, y: 80, width: 400, height: 120 },
    ])
    expect(selectionBoxes(ui, { kind: 'multi-component', componentIndexes: [0, 1] })).toHaveLength(2)
    expect(selectionBoxes(ui, null)).toEqual([])
  })
})

describe('toSlidePoint', () => {
  it('maps client coordinates to slide pixels', () => {
    const rect = { left: 100, top: 100, width: 640, height: 360 } as DOMRect
    expect(toSlidePoint(740, 460, rect)).toEqual({ x: 1280, y: 720 })
    expect(toSlidePoint(100, 100, rect)).toEqual({ x: 0, y: 0 })
  })
})
