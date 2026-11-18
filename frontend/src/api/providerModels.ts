// Ported from servers/nextjs/utils/providerUtils.ts, components/AdvancedTextProviderSettings.tsx, app/(presentation-generator)/services/api/images.ts
import { ApiError, extractApiErrorMessage } from './errors'
import { guardedFetch, readErrorBody, requestJson } from './client'
import { readSse } from './sse'
import { DEFAULT_OLLAMA_URL, LOCALHOST_OLLAMA_URL } from '@/settings/providers'

const REDACTED_SECRET_PLACEHOLDER = '__configured__'
const FALLBACK_MAX_OUTPUT_TOKENS = 8192

export interface OllamaModelInfo {
  name: string
  parameters: string | null
  size: number | null
}

export interface OllamaLibraryModel {
  name: string
  description: string
  parameters: string
  size: string
}

export type OllamaPullEvent = {
  type: 'status' | 'progress' | 'complete' | 'error'
  status?: string
  total?: number
  completed?: number
  progress?: number
  model?: string
  detail?: string
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

function onlyStrings(payload: unknown): string[] {
  return Array.isArray(payload) ? payload.filter((m): m is string => typeof m === 'string') : []
}

export async function listOpenAiCompatibleModels(p: { url: string; apiKey: string }): Promise<string[]> {
  return onlyStrings(
    await postJson<unknown>('/api/v1/ppt/openai/models/available', { url: p.url, api_key: p.apiKey }),
  )
}

export async function listGoogleModels(apiKey: string): Promise<string[]> {
  return onlyStrings(await postJson<unknown>('/api/v1/ppt/google/models/available', { api_key: apiKey }))
}

export async function listAnthropicModels(apiKey: string): Promise<string[]> {
  return onlyStrings(await postJson<unknown>('/api/v1/ppt/anthropic/models/available', { api_key: apiKey }))
}

function normalizeOllamaUrl(url?: string): string {
  return (url || '').trim().replace(/\/+$/, '')
}

function knownParameters(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && value.trim().toLowerCase() !== 'unknown' ? value : null
}

export async function listOllamaModels(url: string): Promise<OllamaModelInfo[]> {
  const params = new URLSearchParams()
  const normalized = normalizeOllamaUrl(url)
  if (normalized) params.set('ollama_url', normalized)
  const query = params.toString()
  const payload = await requestJson<unknown>(
    `/api/v1/ppt/ollama/models/available${query ? `?${query}` : ''}`,
  )
  if (!Array.isArray(payload)) throw new Error('Ollama returned an invalid model list')
  return payload.flatMap((m): OllamaModelInfo[] => {
    if (!m || typeof m !== 'object' || typeof (m as { name?: unknown }).name !== 'string') return []
    const { name, parameters, size } = m as { name: string; parameters?: unknown; size?: unknown }
    return [{ name, parameters: knownParameters(parameters), size: typeof size === 'number' ? size : null }]
  })
}

/**
 * Lists models at `url` (default: the Docker host). When the default is
 * unreachable it retries once on localhost, for installs running outside Docker.
 */
export async function listReachableOllamaModels(
  url?: string,
): Promise<{ models: OllamaModelInfo[]; resolvedUrl: string; usedFallback: boolean }> {
  const preferredUrl = normalizeOllamaUrl(url) || DEFAULT_OLLAMA_URL
  try {
    return { models: await listOllamaModels(preferredUrl), resolvedUrl: preferredUrl, usedFallback: false }
  } catch (error) {
    if (preferredUrl !== DEFAULT_OLLAMA_URL) throw error
    const models = await listOllamaModels(LOCALHOST_OLLAMA_URL)
    return { models, resolvedUrl: LOCALHOST_OLLAMA_URL, usedFallback: true }
  }
}

export async function listOllamaLibrary(): Promise<OllamaLibraryModel[]> {
  const payload = await requestJson<unknown>('/api/v1/ppt/ollama/models/library')
  if (!Array.isArray(payload)) throw new Error('Invalid library model list')
  return payload.flatMap((m): OllamaLibraryModel[] => {
    if (!m || typeof m !== 'object' || typeof (m as { name?: unknown }).name !== 'string') return []
    const { name, description, parameters, size } = m as Record<string, unknown> & { name: string }
    return [
      {
        name,
        description: typeof description === 'string' ? description : '',
        parameters: knownParameters(parameters) ?? '',
        size: typeof size === 'string' ? size : '',
      },
    ]
  })
}

/**
 * Pull a model, reporting progress through `onEvent`. Ends at the first
 * `complete` or `error` event; HTTP failures are reported as an `error` event.
 */
export async function pullOllamaModel(
  name: string,
  url: string,
  onEvent: (e: OllamaPullEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const params = new URLSearchParams({ model_name: name.trim() })
  if (url.trim()) params.set('ollama_url', url.trim())
  const response = await guardedFetch(`/api/v1/ppt/ollama/models/pull?${params.toString()}`, {
    method: 'POST',
    credentials: 'include',
    signal,
  })
  if (!response.ok) {
    const body = await readErrorBody(response)
    onEvent({ type: 'error', detail: extractApiErrorMessage(body, 'Failed to pull model', response.status) })
    return
  }
  if (!response.body) {
    onEvent({ type: 'error', detail: 'No response stream' })
    return
  }
  for await (const frame of readSse(response.body, signal)) {
    let data: Partial<OllamaPullEvent>
    try {
      data = JSON.parse(frame.data) as Partial<OllamaPullEvent>
    } catch {
      continue // truncated payload: skip it rather than abort the pull
    }
    if (frame.event === 'error' || data.type === 'error') {
      onEvent({ type: 'error', detail: data.detail || 'Pull failed' })
      return
    }
    onEvent(data as OllamaPullEvent)
    if (data.type === 'complete') return
  }
}

export async function listOpenRouterProviders(p: {
  model: string
  apiKey: string
  baseUrl?: string
}): Promise<string[]> {
  const payload = await postJson<unknown>('/api/v1/ppt/openrouter/providers/available', {
    model: p.model,
    api_key: p.apiKey,
    base_url: p.baseUrl || undefined,
  })
  // The endpoint returns `{ value, label, available }` options; keep the first
  // of any repeated value or label, and drop blank values.
  const seenValues = new Set<string>()
  const seenLabels = new Set<string>()
  const providers: string[] = []
  for (const option of Array.isArray(payload) ? payload : []) {
    const raw = typeof option === 'string' ? { value: option } : (option as { value?: unknown; label?: unknown })
    const value = typeof raw?.value === 'string' ? raw.value.trim() : ''
    if (!value) continue
    const label = (typeof raw.label === 'string' && raw.label.trim() ? raw.label : value).trim()
    if (seenValues.has(value.toLowerCase()) || seenLabels.has(label.toLowerCase())) continue
    seenValues.add(value.toLowerCase())
    seenLabels.add(label.toLowerCase())
    providers.push(value)
  }
  return providers
}

/** Token defaults for the current provider/model; 8192 when unavailable. */
export async function getGenerationDefaults(): Promise<{ defaultMaxOutputTokens: number }> {
  try {
    const payload = await postJson<{ default_max_output_tokens?: unknown }>(
      '/api/v1/ppt/generation/defaults',
      {},
    )
    if (typeof payload?.default_max_output_tokens === 'number') {
      return { defaultMaxOutputTokens: payload.default_max_output_tokens }
    }
  } catch {
    // fall through to the default
  }
  return { defaultMaxOutputTokens: FALLBACK_MAX_OUTPUT_TOKENS }
}

/** Verify a Pexels/Pixabay key with a one-image search; throws `ApiError` when rejected. */
export async function checkStockImageKey(provider: 'pexels' | 'pixabay', apiKey: string): Promise<void> {
  const params = new URLSearchParams({
    query: 'business',
    limit: '1',
    provider,
    strict_api_key: 'true',
  })
  const headers = new Headers()
  const key = apiKey.trim()
  if (key && key !== REDACTED_SECRET_PLACEHOLDER) headers.set('X-Provider-Api-Key', key)
  const response = await guardedFetch(`/api/v1/ppt/images/search?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    headers,
  })
  if (response.ok) return
  const body = await readErrorBody(response)
  throw new ApiError(
    extractApiErrorMessage(
      body,
      `Unable to reach ${provider} with the provided API key. Please verify your settings and try again.`,
      response.status,
    ),
    response.status,
    body,
  )
}
