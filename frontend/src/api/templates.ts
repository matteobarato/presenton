import { api, unwrap } from './client'
import { getTemplatesRoute, type BuiltinTemplateRoute } from './next-routes'

export type TemplateKind = 'builtin' | 'custom'

export const templatesKey = ['templates'] as const

export interface TemplateSummary {
  id: string
  name: string
  layouts: unknown[]
  theme?: unknown
  fonts?: unknown
  kind: TemplateKind
  description?: string
}

function fromBuiltin(t: BuiltinTemplateRoute): TemplateSummary {
  return {
    id: t.templateID, name: t.templateName, layouts: t.files ?? [],
    kind: 'builtin',
    description: t.settings?.description,
  }
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
    kind: t.is_default ? 'builtin' : 'custom',
    description: t.description ?? undefined,
  }))
  const seen = new Set<string>()
  return [...builtin, ...customs].filter((t) => !seen.has(t.id) && !!seen.add(t.id))
}

const bareId = (id: string) => id.trim().replace(/^template-v2-/, '')

export async function renameTemplate(id: string, name: string): Promise<void> {
  await unwrap(
    api.PATCH('/api/v1/ppt/template/{template_id}', {
      params: { path: { template_id: bareId(id) } },
      body: { name },
    }),
  )
}

export async function deleteTemplate(id: string): Promise<void> {
  await unwrap(api.DELETE('/api/v1/ppt/template/{template_id}', { params: { path: { template_id: bareId(id) } } }))
}
