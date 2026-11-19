import { normalizeTemplateTheme, TEMPLATE_THEME_COLOR_KEYS, type TemplateTheme } from '@/render/legacy/lib/template-theme'

type Rgb = [number, number, number]
type Hsl = [number, number, number]

const HEX = /#[0-9a-fA-F]{6}\b/g
const NEUTRAL_SATURATION = 0.12

function toRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1, 7), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`

function toHsl([r, g, b]: Rgb): Hsl {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return [h * 60, s, l]
}

function fromHsl([h, s, l]: Hsl): Rgb {
  const hue = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Maps a colour of the template's own palette onto the chosen theme, by role:
 * 1. an exact palette token becomes the same token of the theme;
 * 2. a neutral (tints, greys) keeps its place between the template's background and text;
 * 3. any other hue is rotated by the same angle as the primary, keeping its lightness.
 * Pure black is left alone (shadows, overlays).
 */
export function makeColorMapper(source: TemplateTheme, target: TemplateTheme): (hex: string) => string {
  const exact = new Map<string, string>()
  for (const key of TEMPLATE_THEME_COLOR_KEYS) {
    const from = source[key].toLowerCase()
    if (!exact.has(from)) exact.set(from, target[key].toLowerCase())
  }
  const [sourceHue, sourceSat] = toHsl(toRgb(source.primary))
  const [targetHue, targetSat] = toHsl(toRgb(target.primary))
  const hueShift = targetHue - sourceHue
  const satScale = sourceSat > 0.05 ? clamp(targetSat / sourceSat, 0.6, 1.4) : 1
  const sourceIsLight = toHsl(toRgb(source.background))[2] > 0.5
  const bg = toRgb(target.background)
  const ink = toRgb(target.background_text)
  const cache = new Map<string, string>()

  return (hex) => {
    const key = hex.toLowerCase()
    const hit = cache.get(key)
    if (hit) return hit
    let out: string
    if (key === '#000000') out = key
    else if (exact.has(key)) out = exact.get(key)!
    else {
      const [h, s, l] = toHsl(toRgb(key))
      if (s < NEUTRAL_SATURATION) out = toHex(mix(ink, bg, sourceIsLight ? l : 1 - l))
      else out = toHex(fromHsl([h + hueShift, clamp(s * satScale, 0, 1), l]))
    }
    cache.set(key, out)
    return out
  }
}

/** The theme to store/render so a template recolours under it: the theme plus the template's own palette. */
export function withSourceTheme<T extends object>(theme: T, templateTheme: unknown): T & { source_theme?: unknown } {
  return normalizeTemplateTheme(templateTheme) ? { ...theme, source_theme: templateTheme } : theme
}

/** Recolours every `#rrggbb` in a slide's ui to the theme, when the theme carries its source palette. */
export function retintUi(ui: unknown, theme: unknown): unknown {
  const source = normalizeTemplateTheme((theme as { source_theme?: unknown } | null)?.source_theme)
  const target = normalizeTemplateTheme(theme)
  if (!source || !target || !ui) return ui
  const map = makeColorMapper(source, target)
  return JSON.parse(JSON.stringify(ui).replace(HEX, map))
}
