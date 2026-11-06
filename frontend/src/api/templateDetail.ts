import { requestJson } from './client'

export interface TemplateDetail {
  id: string
  name: string
  layouts: Record<string, unknown>[]
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The backend stores `layouts` as either an array or `{ layouts: [...] }`. */
export function extractLayouts(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord)
  if (isRecord(value)) {
    if (Array.isArray(value.layouts)) return value.layouts.filter(isRecord)
    if (isRecord(value.layouts) && Array.isArray(value.layouts.layouts)) return value.layouts.layouts.filter(isRecord)
  }
  return []
}

/** `GET /api/v1/ppt/template/{id}`: the only source of a custom template's real layouts. */
export async function getTemplateDetail(templateId: string): Promise<TemplateDetail> {
  const id = templateId.trim().replace(/^template-v2-/, '')
  const raw = await requestJson<{ id: string; name: string; layouts?: unknown }>(
    `/api/v1/ppt/template/${encodeURIComponent(id)}`,
  )
  return { id: raw.id, name: raw.name, layouts: extractLayouts(raw.layouts) }
}
