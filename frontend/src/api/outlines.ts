import { api, unwrap } from './client'

export interface OutlineItem {
  content: string
}

export const MAX_OUTLINE_SLIDES = 50

export async function getOutline(id: string): Promise<OutlineItem[]> {
  const res = await unwrap(api.GET('/api/v1/ppt/outlines/{id}', { params: { path: { id } } }))
  return res.slides
}

export async function saveOutline(id: string, outlines: OutlineItem[]): Promise<void> {
  await unwrap(
    api.PUT('/api/v1/ppt/outlines/{id}', {
      params: { path: { id } },
      body: { slides: outlines },
    }),
  )
}

/** `layout` is the plain template id, exactly what the old GenerateButton sent. */
export function preparePresentation(body: {
  presentation_id: string
  outlines: OutlineItem[]
  layout: string
  title?: string | null
}): Promise<unknown> {
  return unwrap(api.POST('/api/v1/ppt/presentation/prepare', { body }))
}

export interface TemplateDetail {
  layouts: unknown[]
  theme?: unknown
  fonts?: unknown
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

/** Full layouts of one template; the list endpoint only reports a count. */
export async function getTemplate(id: string): Promise<TemplateDetail> {
  const res = await unwrap(
    api.GET('/api/v1/ppt/template/{template_id}', {
      params: { path: { template_id: id.trim().replace(/^template-v2-/, '') } },
    }),
  )
  return {
    layouts: extractLayouts(res.layouts),
    theme: res.theme ?? undefined,
    fonts: res.fonts ?? undefined,
  }
}

export const templateDetailKey = (id: string) => ['template-detail', id.trim().replace(/^template-v2-/, '')] as const
