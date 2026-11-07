import { describe, expect, it } from 'vitest'
import {
  templateV2AnimationTargets,
  templateV2ItemSources,
} from '@/render/legacy/lib/template-v2-json-to-html'
import { uiWithText, uiWithVideoPlaceholder } from '../slide-editor/fixtures'

const rootText = (text: string) => ({
  type: 'text',
  position: { x: 0, y: 0 },
  size: { width: 100, height: 40 },
  text,
})

describe('templateV2ItemSources', () => {
  it('lists root elements then components', () => {
    const ui = { ...(uiWithText() as object), elements: [rootText('a')] }
    expect(templateV2ItemSources(ui)).toEqual([
      { kind: 'element', index: 0 },
      { kind: 'component', index: 0 },
    ])
  })

  it('places a component placeholder where the render payload does', () => {
    const ui = uiWithVideoPlaceholder()
    const sources = templateV2ItemSources(ui)
    expect(sources).toEqual([
      { kind: 'component', index: 0 },
      { kind: 'component', index: 1 },
    ])
    // placeholder layer is the one animation targets skip
    expect(templateV2AnimationTargets(ui).map((t) => t.id)).toEqual(['e0'])
  })

  it('moves a lifted root placeholder to the end, keeping its element index', () => {
    const placeholder = {
      type: 'image',
      video_placeholder: true,
      position: { x: 5, y: 6 },
      size: { width: 10, height: 10 },
    }
    const ui = { ...(uiWithText() as object), elements: [placeholder, rootText('a')] }
    expect(templateV2ItemSources(ui)).toEqual([
      { kind: 'element', index: 1 },
      { kind: 'component', index: 0 },
      { kind: 'element', index: 0 },
    ])
  })

  it('is empty for an empty ui', () => {
    expect(templateV2ItemSources({})).toEqual([])
  })
})
