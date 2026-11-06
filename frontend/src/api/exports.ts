import { api, unwrap } from './client'
import { ApiError } from './errors'
import type { components } from './schema'
import type { AsyncTask } from './types'

export type VideoRequest = components['schemas']['PresentationVideoRequest']
export type VideoExport = components['schemas']['PresentationVideoResponse']

/**
 * Turn whatever the backend returned for a file (absolute URL, absolute file-system
 * path, or already a served path) into a same-origin path the proxy serves.
 * Mirrors `toBackendServedPath` of the old app.
 */
export function toDownloadUrl(raw: string): string {
  let p = raw
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) {
    try {
      const u = new URL(p)
      p = u.pathname + u.search
    } catch {
      /* keep as is */
    }
  }
  p = p.replace(/\\/g, '/')
  for (const marker of ['/app_data/', '/static/']) {
    const i = p.indexOf(marker)
    if (i !== -1) return p.slice(i)
  }
  for (const dir of ['/images/', '/uploads/', '/fonts/']) {
    const i = p.lastIndexOf(dir)
    if (i !== -1) return `/app_data${p.slice(i)}`
  }
  return p
}

export async function exportPresentation(id: string, export_as: 'pptx' | 'pdf'): Promise<{ path: string }> {
  const res = await unwrap(
    api.POST('/api/v1/ppt/presentation/{id}/export', {
      params: { path: { id } },
      body: { export_as } as never,
    }),
  )
  return { path: toDownloadUrl((res as { path: string }).path) }
}

export function startVideoExport(id: string, req: VideoRequest): Promise<AsyncTask> {
  return unwrap(api.POST('/api/v1/ppt/presentation/{id}/video-export/async', { params: { path: { id } }, body: req }))
}

/** The stored video for one language, or `null` when none was rendered yet (404). */
export async function getVideoExport(id: string, language?: string): Promise<VideoExport | null> {
  try {
    const res = await unwrap(
      api.GET('/api/v1/ppt/presentation/{id}/video-export', {
        params: { path: { id }, query: language ? { language } : {} },
      }),
    )
    return res.videos[0] ?? null
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export async function deleteVideoExport(id: string, language?: string): Promise<void> {
  await unwrap(
    api.DELETE('/api/v1/ppt/presentation/{id}/video-export', {
      params: { path: { id }, query: language ? { language } : {} },
    }),
  )
}
