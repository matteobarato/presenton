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

/** Full layouts of one (custom) template; the list endpoint only reports a count. */
export async function getTemplate(id: string): Promise<TemplateDetail> {
  const res = await unwrap(
    api.GET('/api/v1/ppt/template/{template_id}', {
      params: { path: { template_id: id } },
    }),
  )
  const raw = res.layouts as unknown
  const layouts = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { layouts?: unknown }).layouts)
      ? (raw as { layouts: unknown[] }).layouts
      : []
  return {
    layouts,
    theme: res.theme ?? undefined,
    fonts: res.fonts ?? undefined,
  }
}
