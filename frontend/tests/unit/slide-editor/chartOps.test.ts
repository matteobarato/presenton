import { describe, expect, it } from 'vitest'
import type { ChartElement } from '@/render/legacy/components/slide-editor/types'
import type { RawElement } from '@/slide-editor/model'
import {
  addCategory, addSeries, canAddSeries, axesApply, chartGrid, chartTypeOptions, deleteCategory, deleteSeries,
  defaultLegendVisible, isCompleteNumericInput, isRadial, moveSeries, readChart, setCategory,
  setChartField, setChartType, setDataLabels, setSeriesName, setValue, withGrid, writeChart,
} from '@/slide-editor/chartOps'

const chart = (o: Partial<ChartElement> = {}) =>
  ({ type: 'chart', chart_type: 'bar', ...o }) as ChartElement

const barRaw: RawElement = {
  type: 'chart',
  position: { left: 10, top: 20 },
  size: { width: 400, height: 300 },
  chart_type: 'bar',
  title: 'Revenue',
  data: [
    { label: 'Q1', value: 1, color: '7C51F8' },
    { label: 'Q2', value: 2, color: '7C51F8' },
  ],
  categories: ['Q1', 'Q2'],
  series: [{ name: 'A', values: [1, 2] }, { name: 'B', values: [3, 4] }],
  colors: ['7C51F8', '155DFC'],
  x_axis: true,
  y_axis: true,
  x_axis_title: 'Quarter',
  y_axis_title: 'USD',
  data_labels: 'top',
  legend: true,
  legend_position: 'bottom',
}

const pieRaw: RawElement = {
  type: 'chart',
  position: { left: 0, top: 0 },
  size: { width: 300, height: 300 },
  chart_type: 'pie',
  title: 'Share',
  data: [
    { label: 'x', value: 2, color: '7C51F8' },
    { label: 'y', value: 3, color: '155DFC' },
  ],
  categories: ['x', 'y'],
  series: [{ name: 'Share', values: [2, 3] }],
  colors: ['7C51F8', '155DFC'],
  data_labels: null,
  legend: true,
}

describe('chart type options', () => {
  it('omits bubble unless current', () => {
    expect(chartTypeOptions('bar')).toHaveLength(11)
    expect(chartTypeOptions('bar').some((o) => o.value === 'bubble')).toBe(false)
    expect(chartTypeOptions('bubble')).toHaveLength(12)
    expect(chartTypeOptions('bubble').at(-1)).toEqual({ value: 'bubble', label: 'Bubble Chart' })
  })
})

describe('chartGrid / withGrid', () => {
  it('pads ragged values', () => {
    const g = chartGrid(chart({ categories: ['a', 'b', 'c'], series: [{ name: 'S', values: [1] }] }))
    expect(g.series[0].values).toEqual([1, 0, 0])
    expect(g.categories).toEqual(['a', 'b', 'c'])
  })
  it('reads a pie from data', () => {
    const g = chartGrid(chart({ chart_type: 'pie', data: [{ label: 'x', value: 2 }] }))
    expect(g.categories).toEqual(['x'])
    expect(g.series).toHaveLength(1)
    expect(g.series[0].values).toEqual([2])
  })
  it('gives an empty chart 1 category and 1 series', () => {
    const g = chartGrid(chart())
    expect(g.categories).toHaveLength(1)
    expect(g.series).toHaveLength(1)
    expect(g.series[0].values).toHaveLength(1)
  })
  it('round-trips a multi-series chart', () => {
    const c = readChart(barRaw)
    const next = withGrid(c, chartGrid(c))
    expect(chartGrid(next)).toEqual(chartGrid(c))
    expect(next.series).toEqual(c.series)
    expect(next.categories).toEqual(c.categories)
  })
  it('writes data with labels and values for a pie', () => {
    const c = readChart(pieRaw)
    const next = withGrid(c, setValue(setCategory(chartGrid(c), 0, 'z'), 0, 0, 9))
    expect(next.data?.map((d) => [d.label, d.value])).toEqual([['z', 9], ['y', 3]])
    expect(next.series).toHaveLength(1)
  })
  it('writes data and colours for multi-series', () => {
    const c = readChart(barRaw)
    const next = withGrid(c, addSeries(chartGrid(c)))
    expect(next.series).toHaveLength(3)
    expect(next.colors!.length).toBeGreaterThanOrEqual(3)
    expect(next.data).toHaveLength(2)
  })
})

describe('grid ops', () => {
  const g = { categories: ['a', 'b'], series: [{ name: 'S1', values: [1, 2] }, { name: 'S2', values: [3, 4] }] }
  it('setters limit text and do not mutate', () => {
    expect(setCategory(g, 0, 'x'.repeat(200)).categories[0]).toHaveLength(128)
    expect(setSeriesName(g, 1, 'N').series[1].name).toBe('N')
    expect(setValue(g, 1, 0, 7).series[0].values).toEqual([1, 7])
    expect(g.series[0].values).toEqual([1, 2])
  })
  it('adds and deletes', () => {
    const a = addCategory(g)
    expect(a.categories).toHaveLength(3)
    expect(a.series.every((s) => s.values.length === 3)).toBe(true)
    expect(deleteCategory(a, 0).categories).toEqual(['b', a.categories[2]])
    expect(addSeries(g).series).toHaveLength(3)
    expect(deleteSeries(g, 0).series.map((s) => s.name)).toEqual(['S2'])
  })
  it('never deletes the last', () => {
    const one = { categories: ['a'], series: [{ name: 'S', values: [1] }] }
    expect(deleteCategory(one, 0)).toEqual(one)
    expect(deleteSeries(one, 0)).toEqual(one)
  })
  it('moves series', () => {
    expect(moveSeries(g, 0, 1).series.map((s) => s.name)).toEqual(['S2', 'S1'])
    expect(moveSeries(g, 0, -1)).toEqual(g)
  })
})

describe('limits', () => {
  const big = (nc: number, ns: number) => ({
    categories: Array.from({ length: nc }, (_, i) => `c${i}`),
    series: Array.from({ length: ns }, (_, i) => ({ name: `s${i}`, values: Array(nc).fill(0) })),
  })
  it('caps categories and series', () => {
    expect(addCategory(big(24, 1))).toEqual(big(24, 1))
    expect(addCategory(big(23, 1)).categories).toHaveLength(24)
    expect(addSeries(big(2, 12))).toEqual(big(2, 12))
    expect(canAddSeries(big(2, 1), 'pie')).toBe(false)
    expect(canAddSeries(big(2, 1), 'bar')).toBe(true)
    expect(canAddSeries(big(2, 12), 'bar')).toBe(false)
  })
  // Caps gate the add actions only: data a chart already holds survives a Done.
  it('withGrid keeps existing categories beyond 24 and series beyond 12', () => {
    const next = withGrid(chart(), big(30, 14))
    expect(next.categories).toHaveLength(30)
    expect(next.series).toHaveLength(14)
    expect(next.series![0].values).toHaveLength(30)
  })
  it('a single-series Done writes the edited first series and keeps the hidden rest', () => {
    const raw: RawElement = {
      ...pieRaw,
      categories: ['x', 'y'],
      series: [{ name: 'A', values: [1, 2] }, { name: 'B', values: [3, 4] }, { name: 'C', values: [5, 6] }],
    }
    const g = chartGrid(readChart(raw))
    // The grid shows the one series a pie renders; the others are hidden, not gone.
    expect(g.series).toHaveLength(1)
    const next = writeChart(raw, withGrid(readChart(raw), setValue(g, 0, 0, 9)))
    expect((next.series as { name: string; values: number[] }[]).map((s) => [s.name, s.values])).toEqual([
      ['A', [9, 2]],
      ['B', [3, 4]],
      ['C', [5, 6]],
    ])
    // Becoming a bar chart shows them again.
    const bar = writeChart(raw, setChartType(readChart(raw), 'bar'))
    expect((bar.series as { name: string }[]).map((s) => s.name)).toEqual(['A', 'B', 'C'])
  })
})

describe('predicates', () => {
  it('isCompleteNumericInput', () => {
    for (const s of ['12', '-3.5', '0']) expect(isCompleteNumericInput(s)).toBe(true)
    for (const s of ['', ' ', '\t\n', '-', '1.', '1e', 'abc']) expect(isCompleteNumericInput(s)).toBe(false)
    expect(isCompleteNumericInput(' 12 ')).toBe(true)
  })
  it('axesApply / isRadial', () => {
    expect(axesApply('pie')).toBe(false)
    expect(axesApply('donut')).toBe(false)
    expect(axesApply('bar')).toBe(true)
    expect(isRadial('radar')).toBe(true)
    expect(isRadial('polar_area')).toBe(true)
    expect(isRadial('bar')).toBe(false)
  })
  it('defaultLegendVisible', () => {
    expect(defaultLegendVisible(chart({ chart_type: 'pie' }))).toBe(true)
    expect(defaultLegendVisible(chart({ series: [{ name: 'Series 1', values: [1] }] }))).toBe(false)
    expect(defaultLegendVisible(chart({ series: [{ name: 'Sales', values: [1] }] }))).toBe(true)
    expect(defaultLegendVisible(chart({ series: [{ name: 'a', values: [1] }, { name: 'b', values: [1] }] }))).toBe(true)
  })
})

describe('setters', () => {
  it('setDataLabels', () => {
    expect(setDataLabels(chart(), null).data_labels).toBe(false)
    expect(setDataLabels(chart(), 'top').data_labels).toBe('top')
  })
  it('setChartType / setChartField', () => {
    expect(setChartType(chart(), 'line').chart_type).toBe('line')
    expect(setChartField(chart(), 'title', 'T').title).toBe('T')
  })
})

describe('round trip', () => {
  it('bar', () => expect(writeChart(barRaw, readChart(barRaw))).toEqual(barRaw))
  it('pie', () => expect(writeChart(pieRaw, readChart(pieRaw))).toEqual(pieRaw))
})
