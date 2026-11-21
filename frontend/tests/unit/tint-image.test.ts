import { describe, expect, it } from 'vitest'
import { templateV2UiToHtml } from '@/render/legacy/lib/template-v2-json-to-html'

const item = (extra: Record<string, unknown> = {}) => ({
  type: 'image',
  data: 'static/a.svg',
  color: '#1A3DB3',
  decorative: true,
  is_icon: false,
  size: { width: 100, height: 100 },
  position: { x: 10, y: 10 },
  ...extra,
})
const ui = (it: unknown) => ({ size: { width: 1280, height: 720 }, background: '#FFFFFF', elements: [it] }) as never

describe('tint images', () => {
  it('renders a tint image through the colour mask', () => {
    const html = templateV2UiToHtml(ui(item({ tint: true })))
    expect(html).toContain('mask:url(')
    expect(html).toContain('color:#1A3DB3')
    expect(html).not.toContain('<img')
  })
  it('renders an image without tint as an img', () => {
    expect(templateV2UiToHtml(ui(item()))).toContain('<img')
  })
  it('keeps the clip-path on a tint image', () => {
    const html = templateV2UiToHtml(ui(item({ tint: true, clip_path: 'circle(50%)' })))
    expect(html).toContain('clip-path')
  })
})
