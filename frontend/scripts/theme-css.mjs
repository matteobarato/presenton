// One-off: moves hex colours in <style> blocks / motion.css to generated tokens (var(--color-*x-hex)).
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { expandHex, lightOf, EXISTING } from './theme-codemod.mjs'

const FILES = process.argv.slice(2)
const roleOfProp = (p) =>
  /^(color|accent-color|caret-color|fill|stroke)$/.test(p) ? 't'
    : /^(border|outline)/.test(p) ? 'l'
    : /^background/.test(p) ? 's' : null
const tokens = {}
for (const f of FILES) {
  let src = readFileSync(f, 'utf8')
  const isVue = f.endsWith('.vue')
  const start = isVue ? src.indexOf('<style') : 0
  if (start < 0) continue
  const head = src.slice(0, start), css = src.slice(start)
  const out = css.replace(/([a-z-]+)\s*:\s*([^;{}\n]*#[0-9a-fA-F]{3,8}\b[^;{}\n]*)/g, (m, prop, val) => {
    const role = roleOfProp(prop)
    if (!role || val.includes('var(')) return m
    return prop + ': ' + val.replace(/#([0-9a-fA-F]{3,8})\b/g, (_, raw) => {
      const hex = expandHex(raw)
      if (![6, 8].includes(hex.length)) return '#' + raw
      const existing = hex.length === 6 ? EXISTING[hex] : undefined
      const name = existing ?? `${role}x-${hex}`
      if (!existing) tokens[name] = { dark: '#' + hex, light: lightOf(hex, role) }
      return `var(--color-${name})`
    })
  })
  writeFileSync(f, head + out)
}
const names = Object.keys(tokens).sort()
appendFileSync('src/styles/tokens.generated.css',
  '\n/* from theme-css.mjs: tokens for <style> blocks */\n@theme {\n' + names.map((n) => `  --color-${n}: ${tokens[n].dark};`).join('\n') +
  '\n}\n.light {\n' + names.map((n) => `  --color-${n}: ${tokens[n].light};`).join('\n') + '\n}\n')
console.log('tokens', names.length)
