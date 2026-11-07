/* eslint-disable @typescript-eslint/no-explicit-any -- loose raw component access */
import { describe, expect, it } from 'vitest'
import { componentBox, readArray, type RawUi } from '@/slide-editor/model'
import { createElementInsertElements, createTextInsertElements } from '@/slide-editor/insert/insert-elements'
import { insertContent } from '@/slide-editor/ops'
import { uiTwoComponents } from './fixtures'

describe('insertContent', () => {
  it('appends text as a new selected component', () => {
    const ui = uiTwoComponents() as RawUi
    const r = insertContent(ui, { content: { elements: createTextInsertElements('title-block') }, label: 'Title' })!
    expect(readArray(r.ui.components)).toHaveLength(3)
    expect(r.selection).toEqual({ kind: 'component', componentIndex: 2 })
  })

  it('keeps block data and gives a repeated block a distinct id, shifted 16px', () => {
    const block = {
      id: 'metric_cards',
      position: { x: 40, y: 40 },
      elements: [{ type: 'text', position: { x: 0, y: 0 }, size: { width: 100, height: 40 }, text: 'A' }],
    }
    const once = insertContent(uiTwoComponents() as RawUi, { block, label: 'Metric Cards' })!
    const twice = insertContent(once.ui, { block, label: 'Metric Cards' })!
    const [a, b] = readArray(twice.ui.components).slice(2) as Array<{ id: string; position: { x: number; y: number } }>
    expect(a!.id).not.toBe(b!.id)
    expect(b!.position).toEqual({ x: a!.position.x + 16, y: a!.position.y + 16 })
    expect((a as any).elements[0].text).toBe('A')
  })

  it('drops a block\'s variants and size, keeping the rest', () => {
    const block = {
      id: 'metric_cards',
      name: 'Metric Cards',
      position: { x: 40, y: 40 },
      size: { width: 600, height: 200 },
      variants: [{ id: 'metric_cards_1' }, { id: 'metric_cards_2' }],
      elements: [{ type: 'text', position: { x: 0, y: 0 }, size: { width: 100, height: 40 }, text: 'A' }],
    }
    const r = insertContent(uiTwoComponents() as RawUi, { block, label: 'Metric Cards' })!
    const added = readArray(r.ui.components)[2] as Record<string, unknown>
    expect(added).not.toHaveProperty('variants')
    expect(added).not.toHaveProperty('size')
    expect(added.name).toBe('Metric Cards')
    expect((added as any).elements[0].text).toBe('A')
  })

  it('does not shift when the spot is free', () => {
    const r = insertContent({ components: [] } as RawUi, {
      content: { elements: createElementInsertElements('vector-rectangle') },
      label: 'Rectangle',
    })!
    expect(componentBox(readArray(r.ui.components)[0] as any)).toMatchObject({ x: 134, y: 134 })
  })

  it('returns null for empty content', () => {
    expect(insertContent(uiTwoComponents() as RawUi, { content: {}, label: 'x' })).toBeNull()
  })
})
