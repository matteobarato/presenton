import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Golden equivalence: the ported renderer must emit byte-identical HTML to the
// original servers/nextjs renderer for every layout of every template.
const oldDir = resolve(process.cwd(), process.env.OLD_FRONTEND_DIR ?? '../servers/nextjs')
const templatesDir = resolve(process.cwd(), '../templates')
const available = existsSync(resolve(oldDir, 'lib'))

type Layout = Record<string, unknown>
const templates: { name: string; layouts: Layout[] }[] = available
  ? readdirSync(templatesDir)
      .filter((d) => existsSync(resolve(templatesDir, d, 'template.json')))
      .sort()
      .map((d) => ({
        name: d,
        layouts: (JSON.parse(readFileSync(resolve(templatesDir, d, 'template.json'), 'utf8')).layouts ??
          []) as Layout[],
      }))
  : []

describe.skipIf(!available)('template-v2 renderer golden equivalence', () => {
  it('finds all 13 templates', () => {
    expect(templates).toHaveLength(13)
  })

  for (const t of templates) {
    describe(t.name, () => {
      it('has layouts', () => {
        expect(t.layouts.length).toBeGreaterThan(0)
      })
      it('matches the old renderer for every layout', async () => {
        const oldMod = await import('@/lib/template-v2-json-to-html')
        const newMod = await import('@new/render/legacy/lib/template-v2-json-to-html')
        const opts = { annotateElements: true }
        t.layouts.forEach((layout, i) => {
          const ui = layout as never
          const where = `${t.name}[${i}]`
          expect(oldMod.templateV2UiToHtml(ui, opts), `${where} renders`).toEqual(expect.any(String))
          expect(newMod.templateV2UiToHtml(ui, opts), `${where} html`).toBe(oldMod.templateV2UiToHtml(ui, opts))
          expect(newMod.templateV2UiToHtml(ui), `${where} html plain`).toBe(oldMod.templateV2UiToHtml(ui))
          expect(newMod.templateV2UiToHtmlFragment(ui, opts), `${where} fragment`).toBe(
            oldMod.templateV2UiToHtmlFragment(ui, opts),
          )
          expect(newMod.hasTemplateV2RenderableUi(ui), `${where} renderable`).toBe(
            oldMod.hasTemplateV2RenderableUi(ui),
          )
          expect(newMod.templateV2UiHasChart(ui), `${where} chart`).toBe(oldMod.templateV2UiHasChart(ui))
        })
      })
    })
  }

  it('compares a non-trivial number of layouts', () => {
    const total = templates.reduce((n, t) => n + t.layouts.length, 0)
    console.log(`golden: ${templates.length} templates, ${total} layouts`)
    expect(total).toBeGreaterThan(50)
  })
})
