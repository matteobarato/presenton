import { ApiError, extractApiErrorMessage } from '@/api/errors'
import { FONT_EXTENSIONS, MAX_FONT_BYTES, MAX_PPTX_BYTES } from '@/api/templateImport'
import { i18n } from '@/i18n'

/** Validation and wording shared by every place a PowerPoint (and its replacement fonts) is uploaded. */

const t = (key: string) => i18n.global.t(`templates.import.errors.${key}`)

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

/** The file name without its extension, trimmed. */
export function baseName(name: string): string {
  const dot = name.lastIndexOf('.')
  return (dot > 0 ? name.slice(0, dot) : name).trim()
}

/** A message when `file` is not an acceptable .pptx, else `null`. */
export function pptxFileError(file: File): string | null {
  if (extensionOf(file.name) !== '.pptx') return t('notPptx')
  if (file.size > MAX_PPTX_BYTES) return t('tooLarge')
  return null
}

/** A message when `file` is not an acceptable replacement font, else `null`. */
export function fontFileError(file: File): string | null {
  if (!(FONT_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))) return t('fontType')
  if (file.size > MAX_FONT_BYTES) return t('fontTooLarge')
  return null
}

/** The server's message for an API failure, else the `templates.import.errors.<fallbackKey>` text. */
export function uploadErrorMessage(e: unknown, fallbackKey: string): string {
  const fallback = t(fallbackKey)
  return e instanceof ApiError ? extractApiErrorMessage(e.body, e.message || fallback, e.status) : fallback
}
