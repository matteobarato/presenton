// Dev tool: builds the hex -> token table for the light theme.
// Usage: node scripts/theme-codemod.mjs  (writes scripts/.theme/{table.json,rules.sed,tokens.generated.css,files.txt})
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

export const EXISTING = {
  '101213': 'rail', '151819': 'shell', '181c1e': 'canvas', '1b1e20': 'storyboard', '1d2123': 'inspector',
  '22292d': 'dialog', '272d30': 'field', 'bee3f3': 'accent', '1b333e': 'accent-ink', 'd4eef9': 'accent-hover',
  'e9ebec': 'text', '989fa5': 'muted', '7f898f': 'faint', '2c3236': 'secondary', 'e5eaec': 'secondary-text',
  '363e43': 'secondary-hover', '5a2929': 'danger', 'f4c0bc': 'danger-text', '121415': 'background',
  'dce8ee': 'popover-foreground',
}

export function roleOf(prefix) {
  const base = prefix.replace(/^(?:[a-z-]+:)*/, '')
  if (/^(bg|from|via|to|accent)$/.test(base)) return 's'
  if (/^(border(-[a-z]+)?|divide|ring|outline)$/.test(base)) return 'l'
  if (/^(text|caret|decoration|fill|stroke)$/.test(base)) return 't'
  return null // shadow etc: left untouched
}

export function expandHex(h) {
  h = h.toLowerCase()
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
  return h
}

// --- colour maths (sRGB <-> OKLab) ---
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
function toOklch([r, g, b]) {
  const [R, G, B] = [r, g, b].map((v) => lin(v / 255))
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { L, C: Math.hypot(a, bb), h: Math.atan2(bb, a) }
}
function fromOklch({ L, C, h }) {
  const a = C * Math.cos(h), b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return [R, G, B].map((v) => Math.round(Math.min(1, Math.max(0, gam(Math.min(1, Math.max(0, v))))) * 255))
}
const interp = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
  }
  return pts.at(-1)[1]
}
const SURFACE = [[0.15, 0.92], [0.3, 1.0], [0.31, 0.955], [0.5, 0.87], [0.7, 0.78], [1, 0.62]]
const TEXT = [[0.25, 0.98], [0.5, 0.55], [0.65, 0.46], [0.8, 0.34], [0.93, 0.24], [1, 0.2]]

/** Light counterpart of a dark-theme colour, by role (s surface, t text, l line). Alpha is preserved. */
export function lightOf(hex, role) {
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const alpha = hex.length === 8 ? hex.slice(6) : ''
  const hasAlpha = alpha !== '' && alpha !== 'ff'
  const { L, C, h } = toOklch(rgb)
  let L2, C2 = C * 0.6
  if (hasAlpha && L > 0.6 && role !== 't') { L2 = 0.28; C2 = Math.min(C, 0.03) } // white-ish overlay -> dark ink overlay
  else if (hasAlpha && L <= 0.6) { L2 = L; C2 = C } // dark scrim/tint stays
  else if (role === 't' || (role === 'l' && L > 0.5)) L2 = interp(TEXT, L)
  else L2 = interp(SURFACE, L)
  const [r, g, b] = fromOklch({ L: L2, C: C2, h })
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('') + (hasAlpha ? alpha : '')
}

const RE = /((?:[a-z0-9-]+:|\[[^\]]*\]:)*!?)((?:[a-z]+-)*[a-z]+)-\[#([0-9a-fA-F]{3,8})\]/g

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = execSync(
    `grep -rlE "[a-z]-\\[#[0-9a-fA-F]{3,8}\\]" src --include=*.vue --include=*.ts | grep -v "src/render/\\|src/slide-editor/"`,
    { encoding: 'utf8' },
  ).trim().split('\n')
  const table = {} // "prefix-[#hex]" -> replacement class core
  const tokens = {} // tokenName -> {dark, light}
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(RE)) {
      const [, , prefix, rawHex] = m
      const role = roleOf(prefix)
      if (!role) continue
      const hex = expandHex(rawHex)
      if (![6, 8].includes(hex.length)) continue
      const key = `${prefix}-[#${rawHex}]`
      const existing = hex.length === 6 ? EXISTING[hex] : undefined
      const name = existing ?? `${role}x-${hex}`
      table[key] = `${prefix}-${name}`
      if (!existing) tokens[name] = { dark: '#' + hex, light: lightOf(hex, role) }
    }
  }
  mkdirSync('scripts/.theme', { recursive: true })
  writeFileSync('scripts/.theme/table.json', JSON.stringify(table, null, 1))
  const esc = (s) => s.replace(/[\][\\.*^$/#!]/g, '\\$&')
  writeFileSync('scripts/.theme/rules.sed', Object.entries(table).sort((a, b) => b[0].length - a[0].length)
    .map(([k, v]) => `s/${esc(k)}/${v}/g`).join('\n') + '\n')
  const names = Object.keys(tokens).sort()
  writeFileSync('src/styles/tokens.generated.css',
    '/* GENERATED by scripts/theme-codemod.mjs: one token per hex used in components. */\n@theme {\n' +
    names.map((n) => `  --color-${n}: ${tokens[n].dark};`).join('\n') + '\n}\n\n.light {\n' +
    names.map((n) => `  --color-${n}: ${tokens[n].light};`).join('\n') + '\n}\n')
  writeFileSync('scripts/.theme/files.txt', files.join('\n') + '\n')
  console.log(`files ${files.length}, rules ${Object.keys(table).length}, new tokens ${names.length}`)
}
