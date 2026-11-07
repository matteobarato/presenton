import { describe, expect, it } from 'vitest'
import type { RawUi } from '@/slide-editor/model'
import { layerPath, layerTree, normalizeSelection } from '@/slide-editor/layerTree'
import { uiTwoComponents } from './fixtures'

function nestedUi(): RawUi {
  return {
    components: [
      {
        description: 'Cards',
        position: { x: 0, y: 0 },
        elements: [
          {
            type: 'group',
            position: { x: 0, y: 0 },
            children: [
              { type: 'text', position: { x: 0, y: 0 }, size: { width: 100, height: 20 }, text: 'First card title' },
              { type: 'image', position: { x: 0, y: 30 }, size: { width: 100, height: 50 }, src: '/static/pics/cat.png?x=1' },
            ],
          },
        ],
      },
      {
        description: 'Footer',
        position: { x: 0, y: 600 },
        elements: [
          { type: 'text', position: { x: 0, y: 0 }, size: { width: 100, height: 20 }, text: 'Left' },
          { type: 'text', position: { x: 200, y: 0 }, size: { width: 100, height: 20 }, text: 'Right' },
        ],
      },
    ],
    elements: [{ type: 'vector', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } }],
  } as unknown as RawUi
}

describe('layerTree', () => {
  it('lists one-element components as their element, with a preview', () => {
    const [text, image] = layerTree(uiTwoComponents())
    expect(text).toMatchObject({ type: 'text', label: 'Text', detail: 'Hello', selection: { kind: 'component', componentIndex: 0 } })
    expect(image).toMatchObject({ type: 'image', label: 'Image', detail: 'a.png', selection: { kind: 'component', componentIndex: 1 } })
    expect(text.children).toEqual([])
  })

  it('nests group children under a one-element component, with element paths through it', () => {
    const [cards] = layerTree(nestedUi())
    expect(cards).toMatchObject({ type: 'group', label: 'Group', detail: 'Cards' })
    expect(cards.children.map((c) => [c.label, c.detail, c.selection])).toEqual([
      ['Text', 'First card title', { kind: 'element', componentIndex: 0, elementPath: [0, 0] }],
      ['Image', 'cat.png', { kind: 'element', componentIndex: 0, elementPath: [0, 1] }],
    ])
  })

  it('lists the elements of a multi-element component and the root elements', () => {
    const nodes = layerTree(nestedUi())
    expect(nodes[1]).toMatchObject({ type: 'component', label: 'Component', detail: 'Footer' })
    expect(nodes[1].children.map((c) => c.detail)).toEqual(['Left', 'Right'])
    expect(nodes[2]).toMatchObject({ label: 'Shape', selection: { kind: 'element', componentIndex: -1, elementPath: [0] } })
  })

  it('truncates long text previews', () => {
    const ui = uiTwoComponents() as unknown as { components: { elements: { text: string }[] }[] }
    ui.components[0].elements[0].text = 'x'.repeat(80)
    expect(layerTree(ui as unknown as RawUi)[0].detail).toHaveLength(40)
  })
})

describe('layerPath', () => {
  it('returns the node with its ancestors', () => {
    const ui = nestedUi()
    const path = layerPath(layerTree(ui), ui, { kind: 'element', componentIndex: 0, elementPath: [0, 1] })
    expect(path?.map((n) => n.label)).toEqual(['Group', 'Image'])
  })

  it('maps element [0] of a one-element component to the component', () => {
    const ui = uiTwoComponents()
    expect(normalizeSelection(ui, { kind: 'element', componentIndex: 0, elementPath: [0] })).toEqual({ kind: 'component', componentIndex: 0 })
    expect(layerPath(layerTree(ui), ui, { kind: 'element', componentIndex: 0, elementPath: [0] })?.map((n) => n.key)).toEqual(['c0'])
  })

  it('is null for a multi-selection or a missing node', () => {
    const ui = uiTwoComponents()
    expect(layerPath(layerTree(ui), ui, { kind: 'multi-component', componentIndexes: [0, 1] })).toBeNull()
    expect(layerPath(layerTree(ui), ui, { kind: 'component', componentIndex: 9 })).toBeNull()
  })
})
