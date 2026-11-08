import { describe, expect, it } from 'vitest'
import { templateV2UiToHtmlFragment } from '@/render/legacy/lib/template-v2-json-to-html'
import { uiWithShape, uiWithText } from '../slide-editor/fixtures'

type Ui = { components: Array<{ elements: Array<Record<string, unknown>> }> }
const withProps = (ui: unknown, props: Record<string, unknown>) => {
  const copy = JSON.parse(JSON.stringify(ui)) as Ui
  Object.assign(copy.components[0].elements[0], props)
  return copy
}
const shadow = { color: '000000', blur: 10, opacity: 0.5, offset_x: 6, offset_y: 4 }

describe('opacity and shadow rendering', () => {
  it('emits opacity and a drop-shadow filter for a polygon vector', () => {
    const html = templateV2UiToHtmlFragment(withProps(uiWithShape(), { opacity: 0.4, shadow })) ?? ''
    expect(html).toMatch(/opacity:0\.4;/)
    expect(html).toMatch(/filter:drop-shadow\(6px 4px 10px [^)]*\)\)?;/)
  })

  it('emits them for an ellipse vector', () => {
    const html = templateV2UiToHtmlFragment(withProps(uiWithShape(), { shape: 'ellipse', opacity: 0.4, shadow })) ?? ''
    expect(html).toMatch(/opacity:0\.4;/)
    expect(html).toContain('filter:drop-shadow(6px 4px 10px')
  })

  it('emits neither when unset or 1', () => {
    const html = templateV2UiToHtmlFragment(withProps(uiWithShape(), { opacity: 1 })) ?? ''
    expect(html).not.toContain('drop-shadow')
    expect(html).not.toMatch(/opacity:1;/)
  })

  it('emits opacity for text', () => {
    const html = templateV2UiToHtmlFragment(withProps(uiWithText(), { opacity: 0.3 })) ?? ''
    expect(html).toMatch(/opacity:0\.3;/)
  })
})
