// Chart hydration for template-v2 slides rendered into a shadow root.
// Ported from servers/nextjs/app/(presentation-generator)/components/TemplateV2HtmlSlidePreview.tsx
import {
  loadChartBrowserRuntime,
  type ChartConfigurationLike,
  type ChartInstanceLike,
} from '@/render/legacy/lib/chart-browser'

type Rec = Record<string, unknown>

type ChartGlobalState = { status: 'pending' | 'ready' | 'error'; pending: number; rendered: number; message?: string }

declare global {
  interface Window {
    __PRESENTON_JSON_CHARTS__?: ChartGlobalState
  }
}

// Shared with exporters that wait for `status === 'ready'`.
function globalState(): ChartGlobalState {
  return (window.__PRESENTON_JSON_CHARTS__ ??= { status: 'ready', pending: 0, rendered: 0 })
}

function markPending(count: number) {
  if (count <= 0) return
  const state = globalState()
  state.pending += count
  state.status = 'pending'
  delete state.message
}

function markReady(count: number) {
  if (count <= 0) return
  const state = globalState()
  if (state.status === 'error') return
  state.pending = Math.max(0, state.pending - count)
  state.rendered += count
  if (state.pending === 0) state.status = 'ready'
}

function markError(message: string) {
  const state = globalState()
  state.pending = 0
  state.status = 'error'
  state.message = message
}

const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const num = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function chartValue(raw: unknown): number {
  if (typeof raw === 'number') return raw
  const r = rec(raw)
  return num(r.y ?? r.value ?? r.data) ?? num(raw) ?? 0
}

function formatChartValue(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (Math.abs(value) >= 1000) return Intl.NumberFormat('en', { notation: 'compact' }).format(value)
  return Math.abs(value) % 1 === 0 ? String(value) : String(Math.round(value * 10) / 10).replace(/\.0$/, '')
}

function formatAxisTick(value: unknown): string {
  const n = Number(value)
  return Number.isFinite(n) ? formatChartValue(n) : String(value)
}

function hydrateScales(scales: unknown) {
  Object.values(rec(scales)).forEach((scaleValue) => {
    const scale = rec(scaleValue)
    for (const ticks of [rec(scale.ticks), rec(rec(scale.r).ticks)]) {
      if (ticks.presentonFormat) {
        ticks.callback = formatAxisTick
        delete ticks.presentonFormat
      }
    }
  })
}

function barBorderRadius(raw: unknown, horizontal: boolean, radius: number) {
  const negative = chartValue(raw) < 0
  if (horizontal) {
    return negative
      ? { bottomLeft: radius, bottomRight: 0, topLeft: radius, topRight: 0 }
      : { bottomLeft: 0, bottomRight: radius, topLeft: 0, topRight: radius }
  }
  return negative
    ? { bottomLeft: radius, bottomRight: radius, topLeft: 0, topRight: 0 }
    : { bottomLeft: 0, bottomRight: 0, topLeft: radius, topRight: radius }
}

function hydrateBarBorderRadii(config: ChartConfigurationLike) {
  const datasets = Array.isArray(config.data?.datasets) ? config.data.datasets : []
  datasets.forEach((dataset) => {
    const record = dataset as { borderRadius?: unknown; presentonBarRadius?: unknown }
    const options = rec(record.presentonBarRadius)
    if (!Object.keys(options).length) return
    const horizontal = Boolean(options.horizontal)
    const radius = num(options.radius) ?? 7
    record.borderRadius = (context: { raw?: unknown }) => barBorderRadius(context?.raw, horizontal, radius)
    delete record.presentonBarRadius
  })
}

function hydrateDataLabels(config: ChartConfigurationLike) {
  const options = rec(rec(config.options?.plugins).datalabels)
  if (!Object.keys(options).length) return
  options.formatter = (value: unknown) => formatChartValue(chartValue(value))
  delete options.presentonOutsideColor
  delete options.presentonPosition
}

/**
 * Renders every `canvas[data-presenton-chart]` under `root`. Resolves once all
 * charts are drawn (or rejects); the returned `dispose` destroys the charts.
 */
export function hydrateTemplateCharts(root: ParentNode): { done: Promise<void>; dispose: () => void } {
  const charts: ChartInstanceLike[] = []
  let disposed = false
  let completed = false
  let registered = 0

  const canvases = Array.from(root.querySelectorAll<HTMLCanvasElement>('canvas[data-presenton-chart]')).filter(
    (canvas) => canvas.getAttribute('data-chart-config'),
  )

  const done = (async () => {
    if (!canvases.length) return
    registered = canvases.length
    markPending(registered)
    try {
      const { Chart } = await loadChartBrowserRuntime()
      if (disposed) return
      canvases.forEach((canvas) => {
        Chart.getChart(canvas)?.destroy()
        const config = JSON.parse(canvas.getAttribute('data-chart-config') ?? '{}') as ChartConfigurationLike
        config.options = { ...(config.options ?? {}), animation: false, responsive: false, maintainAspectRatio: false }
        hydrateScales(config.options?.scales)
        hydrateBarBorderRadii(config)
        hydrateDataLabels(config)
        const chart = new Chart(canvas, config)
        chart.update('none')
        canvas.dataset.presentonChartRendered = 'true'
        charts.push(chart)
      })
      completed = true
      markReady(registered)
    } catch (error) {
      if (disposed) return
      completed = true
      markError(error instanceof Error ? error.message : String(error))
      throw error
    }
  })()

  return {
    done,
    dispose() {
      disposed = true
      if (!completed) markReady(registered)
      charts.forEach((chart) => chart.destroy())
    },
  }
}
