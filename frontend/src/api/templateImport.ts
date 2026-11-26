import { api, requestJson, unwrap } from './client'
import { ApiError } from './errors'
import type { AsyncTask } from './tasks'
import type { components } from './schema'

/** Turning an uploaded .pptx into a custom template, as one server-side async task. */

export type FontInfo = components['schemas']['FontInfo']
export type ImportPreview = components['schemas']['FontsUploadAndSlidesPreviewResponse']

export const MAX_PPTX_BYTES = 100 * 1024 * 1024
export const MAX_FONT_BYTES = 10 * 1024 * 1024
export const FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'] as const

const TASK_TYPE = 'template.create'
/** Older pending tasks are assumed orphaned (e.g. by a backend restart) and not shown. */
const RECENT_TASK_MS = 6 * 60 * 60 * 1000

export interface FontReplacement {
  /** The unavailable font's `name`, as reported by the font check. */
  name: string
  file: File
}

/** Fonts the deck uses that the server lacks; `null` when the check is not allowed (admin-only). */
export async function checkFonts(file: File): Promise<FontInfo[] | null> {
  const body = new FormData()
  body.append('pptx_file', file)
  try {
    const result = await requestJson<components['schemas']['FontCheckResponse']>('/api/v1/ppt/fonts/check', {
      method: 'POST',
      body,
    })
    return result.unavailable_fonts ?? []
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) return null
    throw e
  }
}

/** Uploads the deck (and any replacement fonts) and renders one preview image per slide. */
export function prepareImport(file: File, fonts: FontReplacement[]): Promise<ImportPreview> {
  const body = new FormData()
  body.append('pptx_file', file)
  for (const font of fonts) {
    body.append('font_files', font.file)
    body.append('original_font_names', font.name)
  }
  return requestJson<ImportPreview>('/api/v1/ppt/template/fonts-upload-and-slides-preview', { method: 'POST', body })
}

export function startImport(preview: ImportPreview, meta: { name: string; description?: string }): Promise<AsyncTask> {
  const description = meta.description?.trim()
  return unwrap(
    api.POST('/api/v1/ppt/template/async', {
      body: {
        pptx_url: preview.modified_pptx_url,
        slide_image_urls: preview.slide_image_urls,
        fonts: preview.fonts,
        name: meta.name.trim(),
        // The generated layouts decide the icon style; this is only the fallback (the backend default).
        icon_type: 'bold',
        ...(description ? { description } : {}),
      },
    }),
  )
}

export function retryImport(taskId: string): Promise<AsyncTask> {
  return unwrap(api.POST('/api/v1/ppt/template/async/{task_id}/retry', { params: { path: { task_id: taskId } } }))
}

/** Imports still running, newest first. */
export function listImportTasks(now: Date = new Date()): Promise<AsyncTask[]> {
  return unwrap(
    api.GET('/api/v1/async-tasks', {
      params: {
        query: {
          type: TASK_TYPE,
          status: 'pending',
          created_at_from: new Date(now.getTime() - RECENT_TASK_MS).toISOString(),
        },
      },
    }),
  )
}

export type SlideImportStatus = 'completed' | 'pending'

export interface ImportProgress {
  templateId: string | null
  name: string | null
  thumbnail: string | null
  done: number
  total: number
  slides: SlideImportStatus[]
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)

/** Reads the progress the backend keeps in `task.data`; anything malformed reads as nothing done. */
export function readImportProgress(task: AsyncTask | null): ImportProgress {
  const data = isRecord(task?.data) ? task.data : {}
  const done = count(data.created_layouts)
  const total = done + count(data.remaining_layouts)
  const statuses = Array.isArray(data.slide_layout_statuses) ? data.slide_layout_statuses : null
  const slides: SlideImportStatus[] = statuses
    ? statuses.map((s) => (isRecord(s) && s.status === 'completed' ? 'completed' : 'pending'))
    : Array.from({ length: total }, (_, i) => (i < done ? 'completed' : 'pending'))
  return {
    templateId: str(data.template_v2_id),
    name: str(data.name),
    thumbnail: str(data.thumbnail),
    done,
    total,
    slides,
  }
}
