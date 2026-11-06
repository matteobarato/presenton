import { api, unwrap } from './client'
import { getTemplatesRoute, type BuiltinTemplateRoute } from './next-routes'

export interface TemplateSummary {
  id: string
  name: string
  layouts: unknown[]
  theme?: unknown
  fonts?: unknown
}

function fromBuiltin(t: BuiltinTemplateRoute): TemplateSummary {
  return { id: t.templateID, name: t.templateName, layouts: t.files ?? [] }
}

/** Built-in templates (Next.js scan) first, then custom ones; first id wins. */
export async function listTemplates(): Promise<TemplateSummary[]> {
  const [builtinRaw, custom] = await Promise.all([
    getTemplatesRoute(),
    unwrap(api.GET('/api/v1/ppt/template/all', { params: { query: { page: 1, page_size: 100 } } })),
  ])
  const builtin = Array.isArray(builtinRaw) ? (builtinRaw as BuiltinTemplateRoute[]).map(fromBuiltin) : []
  const customs: TemplateSummary[] = custom.items.map((t) => ({
    id: t.id,
    name: t.name,
    // The list endpoint only reports a count, not the layouts themselves.
    layouts: Array.from({ length: t.layout_count }),
  }))
  const seen = new Set<string>()
  return [...builtin, ...customs].filter((t) => !seen.has(t.id) && !!seen.add(t.id))
}
