import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { jsonrepair } from 'jsonrepair'
import { streamEvents } from '@/api/sse'
import { getOutline, MAX_OUTLINE_SLIDES, type OutlineItem } from '@/api/outlines'

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1_000
const DEFAULT_STATUS = 'Preparing your presentation outline'

function toItems(slides: unknown): OutlineItem[] | null {
  if (!Array.isArray(slides)) return null
  return slides.slice(0, MAX_OUTLINE_SLIDES).map((s) => {
    const c = s && typeof s === 'object' ? (s as { content?: unknown }).content : undefined
    return { content: typeof c === 'string' ? c : c == null ? '' : String(c) }
  })
}

/** Parse the accumulated (possibly truncated) JSON text; null when nothing usable yet. */
function parsePartial(text: string): OutlineItem[] | null {
  try {
    return toItems((JSON.parse(jsonrepair(text)) as { slides?: unknown }).slides)
  } catch {
    return null
  }
}

function completePayload(event: Record<string, unknown>): OutlineItem[] | null {
  const presentation = event.presentation as { outlines?: { slides?: unknown } } | undefined
  return toItems(presentation?.outlines?.slides)
}

/**
 * Streams the outline for a presentation. An outline that already exists is
 * loaded as is; otherwise chunks are accumulated and repaired progressively.
 * Retries mirror the old hook: up to 3 times, 1s * n apart, for lost
 * connections, bad complete payloads and error events marked retryable.
 */
export function useOutlineStream(id: Ref<string>) {
  const items = ref<OutlineItem[]>([])
  const status = ref(DEFAULT_STATUS)
  const streaming = ref(false)
  const error = ref<string | null>(null)
  let controller: AbortController | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  function abort() {
    controller?.abort()
    controller = null
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    streaming.value = false
  }

  async function run(presentationId: string) {
    abort()
    const ctrl = new AbortController()
    controller = ctrl
    error.value = null
    items.value = []
    status.value = DEFAULT_STATUS
    streaming.value = true

    const existing = await getOutline(presentationId).catch(() => [] as OutlineItem[])
    if (ctrl.signal.aborted) return
    if (existing.length) {
      items.value = existing.slice(0, MAX_OUTLINE_SLIDES)
      status.value = 'Outline ready'
      streaming.value = false
      return
    }

    let attempt = 0
    for (;;) {
      let text = ''
      let failure: { message: string; retry: boolean } | null = null
      try {
        for await (const event of streamEvents(`/api/v1/ppt/outlines/stream/${presentationId}`, {
          signal: ctrl.signal,
        })) {
          if (ctrl.signal.aborted) return
          if (event.type === 'status' && typeof event.status === 'string') {
            status.value = event.status
          } else if (event.type === 'chunk' && typeof event.chunk === 'string') {
            text += event.chunk
            const partial = parsePartial(text)
            if (partial) items.value = partial
          } else if (event.type === 'complete') {
            const done = completePayload(event)
            if (!done) {
              failure = {
                message: 'Failed to parse presentation data.',
                retry: true,
              }
              break
            }
            items.value = done
            status.value = 'Outline ready'
            streaming.value = false
            return
          } else if (event.type === 'closing') {
            status.value = 'Outline ready'
            streaming.value = false
            return
          } else if (event.type === 'error') {
            failure = {
              message: typeof event.detail === 'string' && event.detail ? event.detail : 'Outline streaming failed.',
              retry: event.retryable === true,
            }
            break
          }
        }
        if (!failure) {
          // Stream ended without complete/closing: keep what we have.
          streaming.value = false
          return
        }
      } catch (e) {
        if (ctrl.signal.aborted) return
        failure = {
          message: e instanceof Error ? e.message : 'Connection lost.',
          retry: true,
        }
      }

      if (!failure.retry || attempt >= MAX_RETRIES) {
        error.value = failure.message
        streaming.value = false
        return
      }
      attempt += 1
      status.value = 'Reconnecting to outline stream'
      items.value = []
      await new Promise<void>((resolve) => {
        retryTimer = setTimeout(resolve, RETRY_DELAY_MS * attempt)
      })
      retryTimer = null
      if (ctrl.signal.aborted) return
    }
  }

  watch(id, (v) => (v ? void run(v) : abort()), { immediate: true })
  onScopeDispose(abort)

  return { items, status, streaming, error, abort }
}
