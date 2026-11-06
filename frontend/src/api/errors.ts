/** Thrown for any non-2xx backend response. `body` is the parsed JSON (or raw text). */
export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** Thrown when fetch itself fails (proxy target down, network error). */
export class BackendUnreachableError extends Error {
  constructor(message = 'The backend is unreachable') {
    super(message)
    this.name = 'BackendUnreachableError'
  }
}

const INVALID_API_KEY_MESSAGE = 'Invalid API key. Please verify your API key and try again.'
const SAFETY_BLOCK_MESSAGE =
  "The request was blocked by the provider's safety system. Please revise it and try again."

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nestedMessage(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (!isRecord(value)) return null

  for (const key of ['message', 'detail', 'error']) {
    const nested = value[key]
    if (typeof nested === 'string' && nested.trim()) return nested
    const message = nestedMessage(nested)
    if (message) return message
  }
  return null
}

function normalizeApiErrorDetail(detail: unknown): string | null {
  if (!detail) return null
  if (typeof detail === 'string') return detail

  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (isRecord(item)) {
          const loc = Array.isArray(item.loc)
            ? item.loc.filter((v) => typeof v === 'string' || typeof v === 'number').join('.')
            : ''
          if (typeof item.msg === 'string') return loc ? `${loc}: ${item.msg}` : item.msg
          return nestedMessage(item)
        }
        return null
      })
      .filter((v): v is string => Boolean(v))
    return parts.length ? parts.join('; ') : null
  }

  if (isRecord(detail)) return nestedMessage(detail)
  return String(detail)
}

function looksLikeProviderAuthError(message: string, status?: number): boolean {
  const text = message.toLowerCase()
  return (
    /invalid[_\s-]*api[_\s-]*key/.test(text) ||
    /incorrect\s+api\s+key/.test(text) ||
    /api\s+key\s+(?:is\s+)?invalid/.test(text) ||
    text.includes('authentication_error') ||
    text.includes('invalid_api_key') ||
    Boolean(status === 401 && text.includes('api key'))
  )
}

function looksLikeSafetyBlock(message: string): boolean {
  const text = message.toLowerCase()
  return text.includes('moderation_blocked') || text.includes('safety system')
}

function looksLikeRawPayload(message: string): boolean {
  const text = message.trim()
  return (
    text.startsWith('{') ||
    text.startsWith('[') ||
    text.toLowerCase().startsWith('<!doctype') ||
    text.toLowerCase().startsWith('<html') ||
    text.includes("{'error'") ||
    text.includes('"error"') ||
    text.includes('Error code:')
  )
}

function sanitize(message: string, fallback: string, status?: number): string {
  const trimmed = message.trim()
  if (!trimmed) return fallback
  if (looksLikeProviderAuthError(trimmed, status)) return INVALID_API_KEY_MESSAGE
  if (looksLikeSafetyBlock(trimmed)) return SAFETY_BLOCK_MESSAGE
  if (looksLikeRawPayload(trimmed)) return fallback
  return trimmed
}

/** Port of `servers/nextjs/utils/apiErrorMessages.ts#extractApiErrorMessage`. */
export function extractApiErrorMessage(body: unknown, fallback: string, status?: number): string {
  let message: string | null
  if (isRecord(body)) {
    message =
      normalizeApiErrorDetail(body.detail) ||
      (typeof body.message === 'string' ? body.message : null) ||
      normalizeApiErrorDetail(body.error)
  } else {
    message = normalizeApiErrorDetail(body)
  }
  return sanitize(message || fallback, fallback, status)
}
