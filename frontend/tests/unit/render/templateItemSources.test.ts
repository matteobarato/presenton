import { describe, expect, it } from 'vitest'
import {
  templateV2AnimationTargets,
  templateV2ItemSources,
  templateV2UiToHtmlFragment,
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

describe('animation layer pivot', () => {
  const origin = (html: string, id: string) =>
    new RegExp(`data-hf-el="${id}"[^>]*transform-origin:([\\d.]+)px ([\\d.]+)px`).exec(html)?.slice(1).map(Number)

  it('pivots a component layer on the box its elements draw, so a live rotation turns it in place', () => {
    const ui = {
      components: [
        {
          position: { x: 100, y: 50 },
          elements: [
            { type: 'text', position: { x: 0, y: 0 }, size: { width: 200, height: 40 }, text: 'a' },
            { type: 'text', position: { x: 0, y: 60 }, size: { width: 300, height: 40 }, text: 'b' },
          ],
        },
      ],
    }
    const html = templateV2UiToHtmlFragment(ui, { annotateElements: true })!
    expect(origin(html, 'e0')).toEqual([250, 100])
  })
})
