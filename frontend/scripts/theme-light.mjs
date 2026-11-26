// Dev tool: rewrites the `.light` blocks of tokens.generated.css from the dark `@theme` values.
// Usage: node scripts/theme-light.mjs   (safe to re-run; dark values are never touched)
import { readFileSync, writeFileSync } from 'node:fs'
import { toOklch, fromOklch } from './theme-codemod.mjs'

const FILE = 'src/styles/tokens.generated.css'
const ACCENT = '#176f99'
const BLUE = (232 * Math.PI) / 180

/** Tokens whose meaning a formula cannot guess: solid fills, the ink on them, scrims. */
const OVERRIDES = {
  // ink that sits on an accent fill
  'tx-0b1215': '#ffffff', 'tx-0b1a22': '#ffffff', 'tx-19323e': '#ffffff', 'tx-26424e': '#ffffff',
  // pale fills in dark are accent fills in light
  'sx-0f1417': '#14242d',
  'sx-9bd5ee': ACCENT, 'sx-aacdde': ACCENT, 'sx-a9cbdc': ACCENT, 'sx-436b7e': ACCENT, 'sx-e3f5ff': '#125b7e',
  'sx-4bb3e6': '#1f8fd0', 'sx-e8f9ffad': '#ffffffad', 'sx-708590': '#7691a1', 'sx-ff3d8b': '#ff3d8b',
  // ink on the motion clips
  'tx-e6f5fd': '#ffffff',
  // thumbs, knobs, dots
  'sx-cee6f2': '#ffffff', 'sx-424c52': '#b9c9d3', 'sx-dce3e7': '#5f7a8b', 'sx-d0d7dc': '#2c4553', 'sx-9db3c0': '#6b8796',
  // status colours: tinted chip + readable ink
  'sx-9cb5a8': '#2c9a6c', 'sx-bad4cd': '#d5f0e4', 'tx-2d5146': '#14634a',
  'sx-ddccb9': '#f6e6cd', 'tx-493c2e': '#6f4a1c', 'lx-2e2b28': '#ffffff',
  'sx-e8a2a2': '#c4443d', 'sx-6a3131': '#f8d3cf', 'sx-f1cc96': '#c27708',
  // scrims behind theme-coloured text turn into light veils
  'sx-0c1114ee': '#f4f8faf2', 'sx-0c1114d9': '#ffffffe6', 'sx-1b2328e6': '#ffffffe6',
  'sx-080c0f80': '#16394d4d', 'sx-080e1266': '#16394d42',
  // grey-blue hover/tint washes
  'sx-24303829': '#176f990a', 'sx-26313680': '#176f9912', 'sx-2f46502e': '#176f9914',
  'sx-3449554d': '#176f9912', 'sx-3c4c552e': '#176f9914', 'sx-475e6c80': '#176f9926',
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
const SURFACE = [[0.15, 0.978], [0.22, 0.99], [0.26, 0.98], [0.31, 0.967], [0.36, 0.952], [0.45, 0.925], [0.6, 0.86], [1, 0.7]]
// every step stays at 4.5:1 or better on white and on the field tint
const TEXT = [[0.5, 0.55], [0.62, 0.52], [0.72, 0.48], [0.8, 0.41], [0.88, 0.32], [0.95, 0.25], [1, 0.22]]
const LINE = [[0.2, 0.91], [0.4, 0.86], [0.6, 0.76], [1, 0.62]]

const hexOf = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('')

export function lightValue(name, dark) {
  if (OVERRIDES[name]) return OVERRIDES[name]
  const role = name[0]
  const hex = dark.slice(1)
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const alpha = hex.length === 8 ? hex.slice(6) : ''
  const { L, C, h } = toOklch(rgb)
  const deg = ((h * 180) / Math.PI + 360) % 360
  const blue = C < 0.012 || (deg > 190 && deg < 275)

  // translucent washes and hairlines: tint with the accent (or keep their own hue)
  if (alpha && role !== 't') {
    if (L <= 0.5) return dark
    return (blue ? ACCENT : hexOf(fromOklch({ L: 0.52, C: Math.max(C, 0.11), h }))) + alpha
  }
  let out
  if (role === 't') {
    if (!blue) out = { L: 0.46, C: Math.max(C, 0.1), h } // status inks keep their hue
    else if (C >= 0.032 && L >= 0.86) out = { L: 0.46, C: 0.1, h: BLUE } // pale-blue text is accent text
    else out = { L: interp(TEXT, L), C: 0.034, h: BLUE }
  } else if (role === 'l') {
    out = { L: interp(LINE, L), C: blue ? 0.025 : C, h: blue ? BLUE : h }
  } else {
    out = { L: interp(SURFACE, L), C: blue ? Math.min(Math.max(C, 0.006), 0.016) : C, h: blue ? BLUE : h }
  }
  return hexOf(fromOklch(out)) + alpha
}

let css = readFileSync(FILE, 'utf8')
const dark = {}
for (const block of css.matchAll(/@theme \{([^}]*)\}/g))
  for (const m of block[1].matchAll(/--color-([a-z]x-[0-9a-f]+): (#[0-9a-f]+);/g)) dark[m[1]] = m[2]
css = css.replace(/\.light \{[^}]*\}/g, (block) =>
  block.replace(/--color-([a-z]x-[0-9a-f]+): #[0-9a-f]+;/g, (m, name) =>
    dark[name] ? `--color-${name}: ${lightValue(name, dark[name])};` : m))
writeFileSync(FILE, css)
console.log('light tokens rewritten:', Object.keys(dark).length)
