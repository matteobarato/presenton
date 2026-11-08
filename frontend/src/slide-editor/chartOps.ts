// Pure chart operations for the Chart inspector and data-grid dialog. Never mutate inputs.
// Ported (logic only) from servers/nextjs/components/slide-editor/charts/ChartEditorContent.tsx
// (`isCompleteNumericInput`, `defaultChartLegendVisible`, the ChartDataModal write-back) and
// servers/nextjs/components/slide-editor/charts/ChartToolbar.tsx (type labels).
import type {
  ChartElement,
  ChartSeries,
  ChartType,
  DataLabelPosition,
} from '@/render/legacy/components/slide-editor/types'
import {
  DEFAULT_CHART_COLORS,
  chartColorTargetMode,
  chartDataFromSeriesWithColors,
  chartSupportsMultipleSeries,
  extendChartColors,
  limitChartText,
  resolvedChartCategories,
  resolvedChartDatasets,
} from '@/render/legacy/components/slide-editor/charts/chart-data'
import { editorChartToRawChart, rawChartToEditorChart, type RawElement } from '@/slide-editor/model'

export const CHART_TYPE_OPTIONS: { value: ChartType; label: string }[] = [
  { value: 'bar', label: 'Bar Chart' },
  { value: 'horizontal_bar', label: 'Horizontal Bar' },
  { value: 'stacked_bar', label: 'Stacked Bar' },
  { value: 'horizontal_stacked_bar', label: 'Horizontal Stack Bar' },
  { value: 'line', label: 'Line Chart' },
  { value: 'area', label: 'Area Chart' },
  { value: 'pie', label: 'Pie Chart' },
  { value: 'donut', label: 'Donut Chart' },
  { value: 'scatter', label: 'Scatter Chart' },
  { value: 'radar', label: 'Radar Chart' },
  { value: 'polar_area', label: 'Polar Area' },
]

export function chartTypeOptions(current: ChartType): { value: ChartType; label: string }[] {
  return current === 'bubble'
    ? [...CHART_TYPE_OPTIONS, { value: 'bubble', label: 'Bubble Chart' }]
    : CHART_TYPE_OPTIONS
}

export function readChart(raw: RawElement): ChartElement {
  return rawChartToEditorChart(raw)
}

export function writeChart(raw: RawElement, chart: ChartElement): RawElement {
  return editorChartToRawChart(raw, chart as unknown as Record<string, unknown>) as RawElement
}

export type ChartGrid = { categories: string[]; series: { name: string; values: number[] }[] }

export const MAX_CHART_CATEGORIES = 24
export const MAX_CHART_SERIES = 12

export function chartGrid(chart: ChartElement): ChartGrid {
  let categories = resolvedChartCategories(chart)
  let datasets = resolvedChartDatasets(chart).map((d) => ({ name: d.name, values: [...d.values] }))
  if (datasets.length === 0 && chart.data?.length) {
    categories = chart.data.map((d, i) => d.label || `Item ${i + 1}`)
    datasets = [{ name: chart.title || 'Series 1', values: chart.data.map((d) => d.value) }]
  }
  if (categories.length === 0) categories = ['Item 1']
  if (datasets.length === 0) datasets = [{ name: 'Series 1', values: [] }]
  const n = categories.length
  return {
    categories: [...categories],
    series: datasets.map((s) => ({
      name: s.name,
      values: Array.from({ length: n }, (_, i) => s.values[i] ?? 0),
    })),
  }
}

/** Write a grid back, mirroring the old ChartDataModal: categories, series, palette and `data`. */
export function withGrid(chart: ChartElement, grid: ChartGrid): ChartElement {
  const categories = grid.categories.slice(0, MAX_CHART_CATEGORIES).map(limitChartText)
  const n = categories.length
  const series: ChartSeries[] = grid.series
    .slice(0, chartSupportsMultipleSeries(chart.chart_type) ? MAX_CHART_SERIES : 1)
    .map((s) => ({
      name: limitChartText(s.name),
      values: Array.from({ length: n }, (_, i) => s.values[i] ?? 0),
    }))
  const mode = chartColorTargetMode({ ...chart, categories, series })
  const colors = extendChartColors(
    chart.colors,
    Math.max(1, chart.colors?.length ?? 0, mode === 'series' ? series.length : 1),
    chart.color ?? DEFAULT_CHART_COLORS[0],
  )
  return {
    ...chart,
    categories,
    series,
    colors,
    color: colors[0] ?? chart.color,
    data: chartDataFromSeriesWithColors(categories, series, colors, mode === 'category'),
  }
}

const mapSeries = (g: ChartGrid, i: number, f: (s: ChartGrid['series'][number]) => ChartGrid['series'][number]) => ({
  ...g,
  series: g.series.map((s, k) => (k === i ? f(s) : s)),
})

export const setCategory = (g: ChartGrid, i: number, text: string): ChartGrid => ({
  ...g,
  categories: g.categories.map((c, k) => (k === i ? limitChartText(text) : c)),
})

export const setSeriesName = (g: ChartGrid, i: number, text: string): ChartGrid =>
  mapSeries(g, i, (s) => ({ ...s, name: limitChartText(text) }))

export const setValue = (g: ChartGrid, row: number, series: number, n: number): ChartGrid =>
  mapSeries(g, series, (s) => ({ ...s, values: s.values.map((v, k) => (k === row ? n : v)) }))

export const canAddCategory = (g: ChartGrid): boolean => g.categories.length < MAX_CHART_CATEGORIES

/** Single-series types (pie, donut) hold exactly one series; others up to MAX_CHART_SERIES. */
export const canAddSeries = (g: ChartGrid, type: ChartType): boolean =>
  g.series.length < (chartSupportsMultipleSeries(type) ? MAX_CHART_SERIES : 1)

export const addCategory = (g: ChartGrid): ChartGrid =>
  !canAddCategory(g)
    ? g
    : {
        categories: [...g.categories, `Item ${g.categories.length + 1}`],
        series: g.series.map((s) => ({ ...s, values: [...s.values, 0] })),
      }

export const deleteCategory = (g: ChartGrid, i: number): ChartGrid =>
  g.categories.length <= 1 || i < 0 || i >= g.categories.length
    ? g
    : {
        categories: g.categories.filter((_, k) => k !== i),
        series: g.series.map((s) => ({ ...s, values: s.values.filter((_, k) => k !== i) })),
      }

// Capped at MAX_CHART_SERIES here; withGrid slices further for single-series types.
export const addSeries = (g: ChartGrid): ChartGrid =>
  g.series.length >= MAX_CHART_SERIES
    ? g
    : {
        ...g,
        series: [
          ...g.series,
          { name: `Series ${g.series.length + 1}`, values: g.categories.map(() => 0) },
        ],
      }

export const deleteSeries = (g: ChartGrid, i: number): ChartGrid =>
  g.series.length <= 1 || i < 0 || i >= g.series.length
    ? g
    : { ...g, series: g.series.filter((_, k) => k !== i) }

export const moveSeries = (g: ChartGrid, i: number, dir: -1 | 1): ChartGrid => {
  const j = i + dir
  if (i < 0 || j < 0 || i >= g.series.length || j >= g.series.length) return g
  const series = [...g.series]
  ;[series[i], series[j]] = [series[j], series[i]]
  return { ...g, series }
}

export function isCompleteNumericInput(value: string): boolean {
  // The old editor rejected '', '-', '.', '-.'; a trailing '.' is also still mid-typing.
  if (!value || value === '-' || value === '.' || value === '-.' || value.endsWith('.')) return false
  return Number.isFinite(Number(value))
}

export const axesApply = (type: ChartType): boolean => type !== 'pie' && type !== 'donut'
export const isRadial = (type: ChartType): boolean => type === 'radar' || type === 'polar_area'

export function defaultLegendVisible(chart: ChartElement): boolean {
  const series = chart.series ?? []
  return (
    chart.chart_type === 'pie' ||
    chart.chart_type === 'donut' ||
    series.length > 1 ||
    Boolean(series[0]?.name && series[0].name !== 'Series 1')
  )
}

export const setChartType = (chart: ChartElement, t: ChartType): ChartElement => ({ ...chart, chart_type: t })

export function setChartField<K extends keyof ChartElement>(
  chart: ChartElement,
  key: K,
  value: ChartElement[K],
): ChartElement {
  return { ...chart, [key]: value }
}

export const setDataLabels = (chart: ChartElement, p: DataLabelPosition | null): ChartElement => ({
  ...chart,
  data_labels: p ?? false,
})
