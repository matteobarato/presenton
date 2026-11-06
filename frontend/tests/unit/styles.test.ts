import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (name: string) => readFileSync(resolve(process.cwd(), 'src/styles', name), 'utf8')

/** Split a stylesheet into top-level blocks: { prelude, body }. */
function topLevelBlocks(css: string) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks: { prelude: string; body: string }[] = []
  let depth = 0
  let start = 0
  let bodyStart = 0
  for (let i = 0; i < stripped.length; i++) {
    const c = stripped[i]
    if (c === '{') {
      if (depth === 0) bodyStart = i + 1
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0) {
        blocks.push({ prelude: stripped.slice(start, bodyStart - 1).trim(), body: stripped.slice(bodyStart, i) })
        start = i + 1
      }
    } else if (c === ';' && depth === 0) {
      start = i + 1
    }
  }
  return blocks
}

test('element resets sit inside @layer base so Tailwind utilities win', () => {
  const blocks = topLevelBlocks(read('base.css'))
  const unlayered = blocks.filter((b) => !b.prelude.startsWith('@layer base') && !b.prelude.startsWith('@utility'))
  expect(unlayered).toEqual([])
  const base = blocks.find((b) => b.prelude.startsWith('@layer base'))
  expect(base?.body).toContain('button')
  expect(base?.body).toContain('font: inherit')
})

test('motion.css has no editor-specific Aera rules', () => {
  expect(read('motion.css')).not.toMatch(/\.(motion-studio|inspector-tab-list|speaker-notes|canvas-stage|editing-tools)/)
})

test('reduced motion drops translation, scale and blur but keeps opacity', () => {
  const css = read('motion.css')
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
  expect(block).not.toMatch(/animation:\s*none/)
  expect(block).toContain('filter: none')
  expect(block).toContain('animation: fade-in')
})
