import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { toast } from '@/components/ui/sonner'
import { getPresentation, presentationKeys } from '@/api/presentations'
import { streamEvents, type StreamEvent } from '@/api/sse'
import type { Presentation } from '@/api/types'
import { useEditorStore } from '@/stores/editor'
import { applyStreamEvent, type GenerationMetrics, type StreamAccumulator } from '@/editor/streamMerge'

export type StreamStatus = 'idle' | 'streaming' | 'done' | 'error'

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true })
  })

/**
 * Drives `GET /api/v1/ppt/presentation/stream/{id}` while `enabled` is true,
 * folding every event into the `['presentation', id]` cache. Retries retryable
 * failures, and refetches the persisted deck on `complete`/`closing`.
 */
export function usePresentationStream(id: Ref<string>, enabled: Ref<boolean>) {
  const queryClient = useQueryClient()
  const editor = useEditorStore()
  const shownWarnings = new Set<string>()
  const status = ref<StreamStatus>('idle')
  const metrics = ref<GenerationMetrics | null>(null)
  let controller: AbortController | null = null

  async function run(presentationId: string, signal: AbortSignal) {
    const key = presentationKeys.one(presentationId)
    status.value = 'streaming'
    metrics.value = null
    // The prepared deck (settings, theme, no slides yet) is the base to merge into.
    try {
      await queryClient.fetchQuery({ queryKey: key, queryFn: () => getPresentation(presentationId), staleTime: 0 })
    } catch {
      // The stream itself reports a missing deck.
    }

    let retries = 0
    while (!signal.aborted) {
      const acc: StreamAccumulator = { chunks: '', metrics: metrics.value }
      try {
        for await (const ev of streamEvents(`/api/v1/ppt/presentation/stream/${presentationId}`, { signal })) {
          if (signal.aborted) return
          if (ev.type === 'error') {
            const detail = String((ev as { detail?: unknown }).detail ?? 'Generation failed.')
            const e = ev as Extract<StreamEvent, { type: 'error' }>
            if (e.retryable === false) throw Object.assign(new Error(detail), { fatal: true, event: e })
            throw new Error(detail)
          }
          // A refetch resolving mid-stream would overwrite the streamed slides.
          await queryClient.cancelQueries({ queryKey: key })
          queryClient.setQueryData<Presentation | undefined>(key, (prev) => applyStreamEvent(prev, ev, acc))
          for (const detail of acc.warnings ?? []) {
            if (shownWarnings.has(detail)) continue
            shownWarnings.add(detail)
            toast.warning('Some images could not be generated', { description: detail, duration: 12_000 })
          }
          metrics.value = acc.metrics ?? null
          if (ev.type === 'complete' || ev.type === 'closing') {
            status.value = 'done'
            // The stream is a preview; the persisted deck is the truth.
            await queryClient.invalidateQueries({ queryKey: key })
            return
          }
        }
        if (signal.aborted) return
        throw new Error('The connection closed before generation finished.')
      } catch (error) {
        if (signal.aborted) return
        const fatal = (error as { fatal?: boolean }).fatal
        if (!fatal && retries < MAX_RETRIES) {
          retries += 1
          await sleep(RETRY_DELAY_MS * retries, signal)
          continue
        }
        status.value = 'error'
        const done = (error as { event?: { completed_slides?: number } }).event?.completed_slides
        const message = error instanceof Error ? error.message : 'Generation failed.'
        toast.error('Presentation streaming failed', {
          description: done && done > 0 ? `${message} ${done} slides were saved and will be reused.` : message,
        })
        return
      }
    }
  }

  function stop() {
    controller?.abort()
    controller = null
  }

  watch(
    [id, enabled],
    ([presentationId, on]) => {
      stop()
      if (!on || !presentationId) {
        if (status.value === 'streaming') status.value = 'idle'
        return
      }
      controller = new AbortController()
      void run(presentationId, controller.signal)
    },
    { immediate: true },
  )

  watch(
    () => status.value === 'streaming',
    (streaming) => (editor.generating = streaming),
    { immediate: true },
  )

  onScopeDispose(() => {
    stop()
    editor.generating = false
  })

  return { status, metrics, stop }
}
