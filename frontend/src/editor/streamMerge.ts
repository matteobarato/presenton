import { jsonrepair } from 'jsonrepair'
import type { StreamEvent } from '@/api/sse'
import type { Presentation, Slide } from '@/api/types'
import { normalizeBackendAssetUrls } from '@/render/legacy/utils/api'
import {
  mergeSingleSlidePreservingResolvedAssets,
  mergeSlidesPreservingResolvedAssets,
} from '@/render/legacy/presentation/streamAssetMerge'

export interface GenerationMetrics {
  model: string
  input_tokens: number
  output_tokens: number
  thinking_tokens: number | null
  total_tokens: number
  tokens_per_second: number
  duration_seconds: number
  estimated: boolean
  thinking_tokens_estimated: boolean
  supports_thinking: boolean
}

/** Mutable per-stream state: the raw accumulated chunk text and the latest metrics. */
export interface StreamAccumulator {
  chunks: string
  metrics?: GenerationMetrics | null
}

// Stream payloads are untyped JSON; every access below is checked at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>

const metricNumber = (value: unknown, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, n) : fallback
}

/** Metrics only ever grow; the stream may replay older numbers. Mirrors the old hook. */
export function mergeMetrics(prev: GenerationMetrics | null | undefined, data: Loose): GenerationMetrics | null {
  const input = metricNumber(data.input_tokens, prev?.input_tokens ?? 0)
  const output = metricNumber(data.output_tokens, prev?.output_tokens ?? 0)
  const total = metricNumber(data.total_tokens, prev?.total_tokens ?? 0)
  const thinking =
    data.thinking_tokens == null
      ? (prev?.thinking_tokens ?? null)
      : metricNumber(data.thinking_tokens, prev?.thinking_tokens ?? 0)
  const exactThinking = data.thinking_tokens != null && data.thinking_tokens_estimated === false
  const next: GenerationMetrics = {
    model: data.model === undefined ? (prev?.model ?? '') : String(data.model),
    input_tokens: Math.max(prev?.input_tokens ?? 0, input),
    output_tokens: Math.max(prev?.output_tokens ?? 0, output),
    thinking_tokens:
      thinking === null ? null : exactThinking ? thinking : Math.max(prev?.thinking_tokens ?? 0, thinking),
    total_tokens: Math.max(prev?.total_tokens ?? 0, total),
    tokens_per_second: metricNumber(data.tokens_per_second, prev?.tokens_per_second ?? 0),
    duration_seconds: Math.max(
      prev?.duration_seconds ?? 0,
      metricNumber(data.duration_seconds, prev?.duration_seconds ?? 0),
    ),
    estimated: data.estimated === undefined ? (prev?.estimated ?? false) : Boolean(data.estimated),
    thinking_tokens_estimated:
      data.thinking_tokens_estimated === undefined
        ? (prev?.thinking_tokens_estimated ?? false)
        : Boolean(data.thinking_tokens_estimated),
    supports_thinking: prev?.supports_thinking === true || data.supports_thinking === true,
  }
  const meaningful =
    next.input_tokens > 0 ||
    next.output_tokens > 0 ||
    next.total_tokens > 0 ||
    next.tokens_per_second > 0 ||
    next.supports_thinking
  return prev || meaningful ? next : null
}

function withSlides(prev: Presentation | undefined, slides: Slide[], extra: Loose = {}): Presentation {
  return { ...(prev ?? {}), ...extra, slides } as Presentation
}

/** A chunk that is itself one complete slide object (the per-slide streaming path). */
function parseWholeSlide(chunk: unknown): Loose | null {
  if (typeof chunk !== 'string' || !chunk.trim()) return null
  try {
    const parsed = JSON.parse(chunk)
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      typeof parsed.layout === 'string' &&
      typeof parsed.index === 'number' &&
      parsed.content &&
      typeof parsed.content === 'object'
    ) {
      return parsed
    }
  } catch {
    // Not a standalone slide.
  }
  return null
}

function mergeCompletePresentation(prev: Presentation | undefined, incoming: unknown): Presentation | undefined {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return prev
  const next = normalizeBackendAssetUrls(incoming) as Loose
  if (!prev) return next as Presentation
  return {
    ...prev,
    ...next,
    theme: next.theme ?? prev.theme,
    fonts: next.fonts ?? prev.fonts,
    slides: Array.isArray(next.slides)
      ? mergeSlidesPreservingResolvedAssets(prev.slides, next.slides)
      : prev.slides,
  } as Presentation
}

/**
 * Fold one stream event into the cached presentation. Pure apart from `acc`.
 * Mirrors usePresentationStreaming.ts; anything unparseable leaves `prev` as is.
 */
export function applyStreamEvent(
  prev: Presentation | undefined,
  ev: StreamEvent,
  acc: StreamAccumulator,
): Presentation | undefined {
  const data = ev as Loose
  switch (ev.type) {
    case 'generation_metrics': {
      acc.metrics = mergeMetrics(acc.metrics, data)
      return prev
    }

    case 'fonts': {
      if (!data.fonts || typeof data.fonts !== 'object') return prev
      return withSlides(prev, prev?.slides ?? [], { fonts: data.fonts })
    }

    case 'slide_html': {
      const index = Number(data.index)
      const html = typeof data.html === 'string' ? data.html : ''
      if (!Number.isFinite(index) || !html) return prev
      const incoming =
        data.slide && typeof data.slide === 'object'
          ? data.slide
          : {
              id: data.slide_id,
              index,
              layout: 'smart-html',
              layout_group: 'smart-html',
              content: { title: `Slide ${index + 1}` },
              html_content: html,
            }
      return withSlides(prev, mergeSingleSlidePreservingResolvedAssets(prev?.slides, normalizeBackendAssetUrls(incoming)))
    }

    case 'slide_assets': {
      if (!data.slide || typeof data.slide !== 'object') return prev
      return withSlides(prev, mergeSingleSlidePreservingResolvedAssets(prev?.slides, normalizeBackendAssetUrls(data.slide)))
    }

    case 'chunk': {
      if (typeof data.chunk !== 'string') return prev
      acc.chunks += data.chunk
      let next = prev
      const whole = parseWholeSlide(data.chunk)
      if (whole) {
        next = withSlides(next, mergeSingleSlidePreservingResolvedAssets(next?.slides, normalizeBackendAssetUrls(whole)))
      }
      try {
        const partial = normalizeBackendAssetUrls(JSON.parse(jsonrepair(acc.chunks))) as Loose
        if (partial && Array.isArray(partial.slides) && partial.slides.length > 0) {
          next = withSlides(next, mergeSlidesPreservingResolvedAssets(next?.slides, partial.slides), partial)
        }
      } catch {
        // Still truncated beyond repair: keep accumulating.
      }
      return next
    }

    case 'complete':
    case 'closing': {
      acc.chunks = ''
      return mergeCompletePresentation(prev, data.presentation)
    }

    default:
      return prev
  }
}
