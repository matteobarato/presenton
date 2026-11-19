import { describe, expect, it } from 'vitest'
import { makeColorMapper, retintUi, withSourceTheme } from '@/render/retint'
import { DEFAULT_TEMPLATE_THEME, normalizeTemplateTheme } from '@/render/legacy/lib/template-theme'

const light = { colors: { ...DEFAULT_TEMPLATE_THEME, primary: '#f59e0b', background: '#f5f8fe', card: '#ffffff', background_text: '#234cd9', primary_text: '#334155' } }
const dark = { id: 't', name: 'Night', colors: { ...DEFAULT_TEMPLATE_THEME, primary: '#22c55e', background: '#0b1220', card: '#16213a', stroke: '#2a3a5c', background_text: '#e6edf7', primary_text: '#ffffff' } }

describe('retint', () => {
  const map = makeColorMapper(normalizeTemplateTheme(light)!, normalizeTemplateTheme(dark)!)
  it('maps exact palette tokens to the same role of the theme', () => {
    expect(map('#F5F8FE')).toBe('#0b1220')
    expect(map('#FFFFFF')).toBe('#16213a')
  })
  it('flips neutrals between a light template and a dark theme, keeping black', () => {
    expect(map('#eeeeee')).not.toBe('#eeeeee')
    expect(map('#000000')).toBe('#000000')
  })
  it('rotates other hues toward the theme primary', () => {
    const [, g] = [0, parseInt(map('#e11d48').slice(3, 5), 16)]
    expect(map('#e11d48')).not.toBe('#e11d48')
    expect(g).toBeGreaterThanOrEqual(0)
  })
  it('retintUi rewrites every hex in the slide, and is a no-op without a source palette', () => {
    const ui = { background: '#F5F8FE', items: [{ fill: { color: '#FFFFFF' } }] }
    expect(retintUi(ui, dark)).toBe(ui)
    const out = retintUi(ui, withSourceTheme(dark, light)) as typeof ui
    expect(out.background).toBe('#0b1220')
    expect(out.items[0].fill.color).toBe('#16213a')
  })
})
