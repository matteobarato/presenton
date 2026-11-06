import { describe, expect, it } from 'vitest'
import { buildSmartSrcdoc } from '@/render/smart-html'
import { themeCssVars } from '@/render/theme'

describe('buildSmartSrcdoc', () => {
  it('strips user scripts, keeps markup and loads the tailwind runtime', () => {
    const doc = buildSmartSrcdoc('<script>alert(1)</script><div class="p-4">x</div>', {})
    expect(doc).not.toContain('alert(1)')
    expect(doc).toContain('<div class="p-4">x</div>')
    expect(doc).toContain('tailwindcss-browser-4.3.3.js')
    expect(doc).toContain('chart-4.5.1.umd.min.js')
  })
  it('re-injects chart scripts only', () => {
    const doc = buildSmartSrcdoc('<canvas id="c"></canvas><script>new Chart(document.getElementById("c"),{})</script>', {})
    expect(doc).toContain('getElementById')
  })
  it('keeps $ sequences in chart scripts verbatim', () => {
    const code = "new Chart(c,{f:function(v){return '$' + v + \"$&\" + \"$'\"}})"
    const doc = buildSmartSrcdoc(`<canvas></canvas><script>${code}</script>`, {})
    expect(doc).toContain(JSON.stringify([code]).replace(/</g, '\\u003c'))
  })
  it('puts theme variables on :root', () => {
    const doc = buildSmartSrcdoc('<p>x</p>', { theme: { primary: '#112233' } })
    expect(doc).toContain('--primary-color:#112233')
  })
})

describe('themeCssVars', () => {
  it('returns empty for unusable themes', () => {
    expect(themeCssVars(null)).toEqual({})
  })
  it('maps theme colors', () => {
    expect(themeCssVars({ primary: '#112233' })['--primary-color']).toBe('#112233')
  })
})
