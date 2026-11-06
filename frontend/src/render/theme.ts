import { normalizeTemplateTheme } from '@/render/legacy/lib/template-theme'

/** Port of the variable mapping in the old `applyPresentationThemeDom.ts`. */
export function themeCssVars(theme: unknown): Record<string, string> {
  const t = normalizeTemplateTheme(theme)
  if (!t) return {}
  const vars: Record<string, string> = {
    '--primary-color': t.primary,
    '--background-color': t.background,
    '--card-color': t.card,
    '--stroke': t.stroke,
    '--primary-text': t.primary_text,
    '--background-text': t.background_text,
    '--graph-0': t.graph_0,
    '--graph-1': t.graph_1,
    '--graph-2': t.graph_2,
    '--graph-3': t.graph_3,
    '--graph-4': t.graph_4,
    '--graph-5': t.graph_5,
    '--graph-6': t.graph_6,
    '--graph-7': t.graph_7,
    '--graph-8': t.graph_8,
    '--graph-9': t.graph_9,
  }
  const textFont = t.fonts?.textFont
  if (textFont) {
    const family = `"${textFont.name}"`
    vars['font-family'] = family
    vars['--heading-font-family'] = family
    vars['--body-font-family'] = family
  }
  return vars
}

/** `@font-face` CSS for the theme's text font, or '' when it has none. */
export function themeFontFaceCss(theme: unknown): string {
  const font = normalizeTemplateTheme(theme)?.fonts?.textFont
  if (!font) return ''
  const name = font.name.replace(/["\\]/g, '')
  const url = font.url.replace(/["\\\n]/g, '')
  return `@font-face{font-family:"${name}";src:url("${url}");font-display:swap}`
}

/** Serialises vars as declarations, e.g. `--primary-color:#fff;`. */
export function cssVarDeclarations(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([key, value]) => `${key}:${value.replace(/[;{}<]/g, '')};`)
    .join('')
}
