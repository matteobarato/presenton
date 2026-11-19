import { describe, expect, it } from 'vitest'
import { templateV2UiToHtml } from '@/render/legacy/lib/template-v2-json-to-html'
import { retintUi, withSourceTheme } from '@/render/retint'
import { DEFAULT_TEMPLATE_THEME } from '@/render/legacy/lib/template-theme'

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

const source = { colors: { ...DEFAULT_TEMPLATE_THEME, primary: '#f59e0b', background: '#f5f8fe', card: '#ffffff', background_text: '#234cd9', primary_text: '#334155' } }
const target = { id: 't', name: 'Night', colors: { ...DEFAULT_TEMPLATE_THEME, primary: '#22c55e', background: '#0b1220', card: '#16213a', stroke: '#2a3a5c', background_text: '#e6edf7', primary_text: '#ffffff' } }

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
  it('retintUi changes the colour and keeps tint', () => {
    const out = retintUi(ui(item({ tint: true })), withSourceTheme(target, source)) as { elements: Record<string, unknown>[] }
    expect(out.elements[0].color).not.toBe('#1A3DB3')
    expect(out.elements[0].tint).toBe(true)
  })
})
