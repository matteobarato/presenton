import { ApiError, extractApiErrorMessage } from './errors'
import { guardedFetch, readErrorBody } from './client'

export type StreamEvent =
  | { type: 'status'; status: string }
  | { type: 'chunk'; chunk: string }
  | { type: 'trace'; trace: unknown }
  | { type: 'error'; detail: string; retryable?: boolean; completed_slides?: number; total_slides?: number }
  | { type: 'closing' }
  | { type: 'complete'; [key: string]: unknown }
  | { type: string; [key: string]: unknown }

function parseFrame(frame: string): { event: string; data: string } | null {
  let event = 'message'
  const data: string[] = []
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue
    const idx = line.indexOf(':')
    const field = idx === -1 ? line : line.slice(0, idx)
    let value = idx === -1 ? '' : line.slice(idx + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  return data.length ? { event, data: data.join('\n') } : null
}

/**
 * Split an SSE byte stream into `{event, data}` frames. Buffers across reads so
 * a frame split between chunks is delivered once, whole. Wire format:
 * `servers/fastapi/models/sse_response.py`.
 */
export async function* readSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const onAbort = () => void reader.cancel().catch(() => {})
  if (signal?.aborted) onAbort()
  signal?.addEventListener('abort', onAbort, { once: true })
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n?/g, '\n')
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const parsed = parseFrame(buffer.slice(0, sep))
        buffer = buffer.slice(sep + 2)
        if (parsed) yield parsed
      }
      if (done) break
    }
    const tail = parseFrame(buffer)
    if (tail && !signal?.aborted) yield tail
  } finally {
    signal?.removeEventListener('abort', onAbort)
    reader.releaseLock()
  }
}

/** POST/GET an SSE endpoint and yield the parsed `response` events. */
export async function* streamEvents(path: string, init: RequestInit = {}): AsyncGenerator<StreamEvent> {
  const response = await guardedFetch(path, { credentials: 'include', ...init })
  if (!response.ok) {
    const body = await readErrorBody(response)
    throw new ApiError(
      extractApiErrorMessage(body, response.statusText || 'Stream request failed', response.status),
      response.status,
      body,
    )
  }
  if (!response.body) return
  for await (const frame of readSse(response.body, init.signal ?? undefined)) {
    if (frame.event !== 'response') continue
    try {
      yield JSON.parse(frame.data) as StreamEvent
    } catch {
      // Truncated or malformed payload: skip it rather than abort the stream.
    }
  }
}
