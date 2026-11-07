import { describe, expect, it } from 'vitest'
import { selectionLabel, toolbarKind } from '@/slide-editor/toolbarKind'
import type { RawUi, Selection } from '@/slide-editor/model'

const ui = (...elements: Array<Record<string, unknown>>) => ({ components: [{ id: 'c', elements }] }) as unknown as RawUi
const comp: Selection = { kind: 'component', componentIndex: 0 }
const el: Selection = { kind: 'element', componentIndex: 0, elementPath: [0] }

describe('toolbarKind', () => {
  it.each([
    [{ type: 'text' }, 'text', 'Text'],
    [{ type: 'text-list' }, 'list', 'List'],
    [{ type: 'image' }, 'image', 'Image'],
    [{ type: 'image', is_icon: true }, 'icon', 'Icon'],
    [{ type: 'image', isIcon: true }, 'icon', 'Icon'],
    [{ type: 'vector', closed: true }, 'shape', 'Shape'],
    [{ type: 'vector', closed: false }, 'line', 'Line'],
    [{ type: 'other' }, 'generic', 'Element'],
  ])('%j -> %s', (element, kind, label) => {
    for (const sel of [comp, el]) {
      expect(toolbarKind(ui(element), sel)).toBe(kind)
      expect(selectionLabel(ui(element), sel)).toBe(label)
    }
  })

  it('treats a multi-element component as generic', () => {
    expect(toolbarKind(ui({ type: 'text' }, { type: 'text' }), comp)).toBe('generic')
  })
})
