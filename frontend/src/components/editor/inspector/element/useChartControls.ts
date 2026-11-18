import { computed } from 'vue'
import type { ChartElement } from '@/render/legacy/components/slide-editor/types'
import { chartTypeOptions, readChart, setChartType, writeChart } from '@/slide-editor/chartOps'
import { dataRoot } from '@/slide-editor/dataRoot'
import { getElementAtSelection, type ElementSelection, type RawElement } from '@/slide-editor/model'
import { useSelectedElement } from '@/slide-editor/useSelectedElement'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

/**
 * Chart state and edits shared by the Chart inspector section and the floating bar's quick controls.
 * The chart can sit inside a selected component, so it is found by `dataRoot`, never the default `[0]` target.
 */
export function useChartControls() {
  const ctx = useSlideEditingContext()
  const { patch } = useSelectedElement(ctx)

  const root = computed<ElementSelection | null>(() => dataRoot(ctx.ui.value, ctx.selection.value, 'chart'))
  const raw = computed<RawElement | null>(() => (ctx.ui.value && root.value ? getElementAtSelection(ctx.ui.value, root.value) : null))
  const chart = computed<ChartElement | null>(() => (raw.value ? readChart(raw.value) : null))
  const type = computed(() => chart.value?.chart_type ?? 'bar')
  const options = computed(() => chartTypeOptions(type.value))

  function apply(name: string, next: (c: ChartElement) => ChartElement) {
    const at = root.value
    if (!at) return
    patch(name, (el) => writeChart(el, next(readChart(el))), at)
  }
  const changeType = (value: ChartElement['chart_type']) => apply('Chart type', (c) => setChartType(c, value))

  return { root, raw, chart, type, options, apply, changeType }
}
