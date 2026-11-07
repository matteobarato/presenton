import { describe, expect, it } from 'vitest'
import { blockTemplateId, templateBlockGroups } from '@/slide-editor/insert/templateBlocks'

const mc = {
  components: [
    {
      id: 'metric_cards',
      description: 'Cards',
      variants: [
        { id: 'metric_cards', position: { x: 0, y: 0 }, elements: [{ type: 'text' }, { type: 'text' }] },
        { position: { x: 10, y: 10 }, elements: [{ type: 'image' }] },
      ],
    },
    { id: 'title_block', name: 'Title', position: { x: 1, y: 1 }, elements: [{ type: 'text' }] },
  ],
}

describe('templateBlockGroups', () => {
  it('groups components with their variants', () => {
    const g = templateBlockGroups(mc)
    expect(g.map((x) => x.title)).toEqual(['Metric Cards', 'Title'])
    expect(g[0]!.variants).toHaveLength(2)
    expect(g[0]!.variants[1]!.raw).toMatchObject({ id: 'metric_cards_variant_2', description: 'Cards' })
    expect(g[0]!.variants[0]!.elementCount).toBe(2)
    expect(g[1]!.variants).toHaveLength(1)
  })

  it('skips variants without elements, and groups left with none', () => {
    const g = templateBlockGroups([
      { id: 'cards', variants: [{ id: 'a', elements: [] }, { id: 'b', elements: [{ type: 'text' }] }, { id: 'c' }] },
      { id: 'empty', variants: [{ id: 'x', elements: [] }] },
      { id: 'bare' },
      { id: 'inherits', elements: [{ type: 'text' }], variants: [{ id: 'i1' }] },
    ])
    expect(g.map((x) => x.title)).toEqual(['Cards', 'Inherits'])
    expect(g[0]!.variants.map((v) => v.raw.id)).toEqual(['b'])
    expect(g[1]!.variants).toHaveLength(1)
  })

  it('accepts an array, an id-keyed record and empty input', () => {
    expect(templateBlockGroups(mc.components)).toHaveLength(2)
    expect(templateBlockGroups({ a: mc.components[1], b: mc.components[0] })).toHaveLength(2)
    expect(templateBlockGroups(null)).toEqual([])
    expect(templateBlockGroups({ components: [] })).toEqual([])
  })
})

describe('blockTemplateId', () => {
  it('reads the template id from the active slide, stripping the prefix', () => {
    const slides = [
      { id: 'a', layout_group: 'template-v2:modern' },
      { id: 'b', layout_group: 'momentum' },
    ]
    expect(blockTemplateId(slides, 'b')).toBe('momentum')
    expect(blockTemplateId(slides, null)).toBe('modern')
  })

  it('skips smart slides', () => {
    expect(blockTemplateId([{ id: 'a', layout_group: 'smart-html' }, { id: 'b', layout_group: 'pulse' }], 'a')).toBe('pulse')
    expect(blockTemplateId([{ id: 'a', layout_group: 'smart-html' }], 'a')).toBeNull()
  })
})
