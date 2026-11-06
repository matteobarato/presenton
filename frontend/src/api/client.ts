import { ref } from 'vue'
import createClient from 'openapi-fetch'
import type { paths } from './schema'
import { ApiError, BackendUnreachableError, extractApiErrorMessage } from './errors'

export const backendStatus = ref<'ok' | 'unreachable'>('ok')

let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn
}

/**
 * The single place that talks to `fetch`: tracks backend reachability and
 * reports 401s. Resolves `fetch` at call time so it can be swapped in tests.
 */
export async function guardedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await globalThis.fetch(input, init)
  } catch (e) {
    if (e instanceof TypeError) {
      backendStatus.value = 'unreachable'
      throw new BackendUnreachableError()
    }
    throw e
  }
  backendStatus.value = 'ok'
  if (response.status === 401) onUnauthorized()
  return response
}

// openapi-fetch builds a `Request`, which needs an absolute URL (jsdom/undici);
// the origin is the page's own, so calls stay same-origin and paths relative.
const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

export const api = createClient<paths>({
  baseUrl,
  credentials: 'include',
  fetch: (request) => guardedFetch(request),
})

interface FetchResult<T> {
  data?: T
  error?: unknown
  response: Response
}

/** Resolve an openapi-fetch call to its data, or throw `ApiError`. */
export async function unwrap<T>(p: Promise<FetchResult<T>>): Promise<T> {
  const { data, error, response } = await p
  if (!response.ok || error !== undefined) {
    throw new ApiError(
      extractApiErrorMessage(error, response.statusText || 'Request failed', response.status),
      response.status,
      error,
    )
  }
  return data as T
}

export async function readErrorBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** For endpoints outside the OpenAPI spec (Next.js routes, SSE posts, uploads). */
export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (typeof init.body === 'string' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  const response = await guardedFetch(path, { credentials: 'include', ...init, headers })
  if (!response.ok) {
    const body = await readErrorBody(response)
    throw new ApiError(
      extractApiErrorMessage(body, response.statusText || 'Request failed', response.status),
      response.status,
      body,
    )
  }
  if (response.status === 204) return undefined as T
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}
