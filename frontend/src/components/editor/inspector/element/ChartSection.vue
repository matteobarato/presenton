<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Presentation } from '@/api/types'
import type { ChartElement, DataLabelPosition } from '@/render/legacy/components/slide-editor/types'
import { CHART_SYSTEM_COLORS, CHART_TEXT_MAX_LENGTH, appendChartColorTarget, removeChartColorTarget, updateChartColorTarget, limitChartText, readChartDataLabelPosition } from '@/render/legacy/components/slide-editor/charts/chart-data'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import SegmentedControl from '@/components/editor/inspector/controls/SegmentedControl.vue'
import ToggleRow from '@/components/editor/inspector/controls/ToggleRow.vue'
import { field, label, section, segment } from '@/components/editor/inspector/controls/styles'
import { getElementAtSelection, type ElementSelection, type RawElement } from '@/slide-editor/model'
import { dataRoot } from '@/slide-editor/dataRoot'
import {
  axesApply,
  chartGrid,
  chartTypeOptions,
  defaultLegendVisible,
  isRadial,
  readChart,
  setChartField,
  setChartType,
  setDataLabels,
  writeChart,
} from '@/slide-editor/chartOps'
import { themePalette } from '@/slide-editor/themePalette'
import { useSelectedElement } from '@/slide-editor/useSelectedElement'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import ChartColorSwatches from './ChartColorSwatches.vue'

const props = defineProps<{ presentation: Presentation }>()

const ctx = useSlideEditingContext()
const { patch } = useSelectedElement(ctx)
const palette = computed(() => themePalette(props.presentation))
const colourChoices = computed(() => [...new Set([...palette.value, ...CHART_SYSTEM_COLORS.map((c) => `#${c.toLowerCase()}`)])])

/** The chart (it can sit inside a selected component); never the default `[0]` target. */
const root = computed<ElementSelection | null>(() => dataRoot(ctx.ui.value, ctx.selection.value, 'chart'))
const raw = computed<RawElement | null>(() => (ctx.ui.value && root.value ? getElementAtSelection(ctx.ui.value, root.value) : null))
const chart = computed<ChartElement | null>(() => (raw.value ? readChart(raw.value) : null))

/** Local only: Task 9's data dialog binds to this. */
const dataOpen = ref(false)
defineExpose({ dataOpen })

function apply(name: string, next: (c: ChartElement) => ChartElement) {
  const at = root.value
  if (!at) return
  patch(name, (el) => writeChart(el, next(readChart(el))), at)
}

const grid = computed(() => (chart.value ? chartGrid(chart.value) : { categories: [], series: [] }))
const MINI_ROWS = 4
const MINI_SERIES = 3
const mini = computed(() => {
  const g = grid.value
  return {
    series: g.series.slice(0, MINI_SERIES),
    rows: g.categories.slice(0, MINI_ROWS).map((c, i) => ({ category: c, values: g.series.slice(0, MINI_SERIES).map((s) => s.values[i]) })),
    moreRows: Math.max(0, g.categories.length - MINI_ROWS),
    moreSeries: Math.max(0, g.series.length - MINI_SERIES),
  }
})
// readChart pads an empty chart with a placeholder row, so judge emptiness on the raw element.
const empty = computed(() => {
  const r = raw.value as Record<string, unknown> | null
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0)
  if (!r) return true
  const hasSeries = Array.isArray(r.series) && r.series.some((s) => len((s as Record<string, unknown>)?.values) > 0)
  return len(r.categories) === 0 && len(r.data) === 0 && !hasSeries
})

const type = computed(() => chart.value?.chart_type ?? 'bar')
const options = computed(() => chartTypeOptions(type.value))
const axes = computed(() => axesApply(type.value))
const radial = computed(() => isRadial(type.value))

// Chart colours are stored as bare upper-case hex.
const toHex = (c: string | null | undefined) => (c && /^#?[0-9a-f]{6}$/i.test(c) ? `#${c.replace('#', '').toLowerCase()}` : null)
const bare = (c: string) => c.replace('#', '').toUpperCase()

type ColourKey = 'title_color' | 'legend_color' | 'axis_color' | 'grid_color'
const DEFAULTS: Record<ColourKey, () => string> = {
  title_color: () => '344054',
  legend_color: () => '475467',
  axis_color: () => '9AA7BD',
  grid_color: () => chart.value?.axis_color ?? 'D0D5DD',
}
const colourValue = (key: ColourKey) => toHex(chart.value?.[key] ?? DEFAULTS[key]())
// Anchor: the chart root when a colour popover opened, so a deferred commit lands there.
let anchor: ElementSelection | null = null
const hold = () => (anchor = root.value)
function setColour(key: ColourKey, name: string, value: string | null) {
  const at = anchor ?? root.value
  anchor = null
  if (!value || !at) return
  patch(name, (el) => writeChart(el, setChartField(readChart(el), key, bare(value))), at)
}

// Title and axis titles: draft text, committed on blur or Enter.
const drafts = ref<Record<string, string | undefined>>({})
type TextKey = 'title' | 'x_axis_title' | 'y_axis_title'
const textValue = (key: TextKey) => drafts.value[key] ?? chart.value?.[key] ?? ''
function commitText(key: TextKey, name: string) {
  const draft = drafts.value[key]
  if (draft === undefined) return
  delete drafts.value[key]
  const next = limitChartText(draft) || null
  if (next === (chart.value?.[key] ?? null)) return
  apply(name, (c) => setChartField(c, key, next))
}

type FlagKey = 'x_axis' | 'y_axis' | 'x_axis_grid' | 'y_axis_grid'
const flag = (key: FlagKey) => chart.value?.[key] ?? true
const setFlag = (key: FlagKey, name: string, v: boolean) => apply(name, (c) => setChartField(c, key, v))

const legendOn = computed(() => (chart.value ? (chart.value.legend ?? defaultLegendVisible(chart.value)) : false))

const LABELS = [
  { value: 'off', label: 'Off' },
  { value: 'base', label: 'Base' },
  { value: 'mid', label: 'Middle' },
  { value: 'top', label: 'Top' },
  { value: 'outside', label: 'Outside' },
]
const labelValue = computed(() => readChartDataLabelPosition(chart.value?.data_labels) ?? 'off')
/** Builds the swatch update from the current chart at the root held when the picker opened. */
function swatchPatch(name: string, fn: (c: ChartElement) => ChartElement) {
  const at = anchor ?? root.value
  anchor = null
  if (!at) return
  patch(name, (el) => writeChart(el, fn(readChart(el))), at)
}

function setLabels(v: string) {
  const at = root.value
  if (!at) return
  const pos = v === 'off' ? null : (v as DataLabelPosition)
  // The raw writer maps "off" to null. Null, false and an absent key all mean Off to the renderer and backend; we keep writing an explicit false.
  patch('Data labels', (el) => {
    const out = writeChart(el, setDataLabels(readChart(el), pos))
    return pos === null ? { ...out, data_labels: false } : out
  }, at)
}

const sub = 'mb-2 mt-4 text-[10px] text-[#9aa9b0]'
const textField = 'h-full w-full min-w-0 bg-transparent text-[10px] text-[#dce3e7] outline-none placeholder:text-[#6f7d84]'
const xLabels = computed(() => (radial.value ? { axis: 'Category labels', grid: 'Spokes' } : { axis: 'Show axis', grid: 'Show grid' }))
const yLabels = computed(() => (radial.value ? { axis: 'Value labels', grid: 'Rings' } : { axis: 'Show axis', grid: 'Show grid' }))
</script>

<template>
  <template v-if="chart">
    <div :class="section">
      <div :class="label"><h3>Chart</h3></div>
      <label :class="[field, 'w-full']">
        <select
          aria-label="Chart type"
          class="h-full w-full min-w-0 bg-transparent text-[10px] text-[#dce3e7] outline-none"
          :value="type"
          @change="apply('Chart type', (c) => setChartType(c, ($event.target as HTMLSelectElement).value as ChartElement['chart_type']))"
        >
          <option v-for="o in options" :key="o.value" :value="o.value" class="bg-[#232b2f]">{{ o.label }}</option>
        </select>
      </label>
    </div>

    <div :class="section">
      <div :class="label"><h3>Data</h3></div>
      <div data-chart-mini class="overflow-hidden rounded-control border border-white/[0.06] bg-field text-[10px] text-[#dce3e7]">
        <p v-if="empty" class="px-2.5 py-2 text-[#9aa9b0]">No data</p>
        <table v-else class="w-full table-fixed">
          <thead>
            <tr class="text-left text-[9px] text-[#9aa9b0]">
              <th class="truncate px-2 py-1 font-normal" />
              <th v-for="(s, i) in mini.series" :key="i" class="truncate px-2 py-1 font-normal">{{ s.name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in mini.rows" :key="i" class="border-t border-white/[0.05]">
              <td class="truncate px-2 py-1">{{ r.category }}</td>
              <td v-for="(v, j) in r.values" :key="j" class="truncate px-2 py-1">{{ v }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!empty && (mini.moreRows || mini.moreSeries)" class="border-t border-white/[0.05] px-2 py-1 text-[9px] text-[#9aa9b0]">
          <template v-if="mini.moreRows">+{{ mini.moreRows }} more</template>
          <template v-if="mini.moreRows && mini.moreSeries">, </template>
          <template v-if="mini.moreSeries">+{{ mini.moreSeries }} more series</template>
        </p>
      </div>
      <button type="button" :class="[segment, 'mt-2 w-full flex-none text-[10px]']" aria-label="Edit data" @mousedown.prevent @click="dataOpen = !dataOpen">Edit data</button>
    </div>

    <div :class="section">
      <div :class="label"><h3>Colours</h3></div>
      <ChartColorSwatches
        :chart="chart"
        :palette="colourChoices"
        @open="hold"
        @pick="(i, c) => swatchPatch('Chart colour', (ch) => updateChartColorTarget(ch, i, c))"
        @add="swatchPatch('Add chart colour', appendChartColorTarget)"
        @remove="(i) => swatchPatch('Remove chart colour', (ch) => removeChartColorTarget(ch, i))"
      />
    </div>

    <div :class="section">
      <div :class="label"><h3>Title</h3></div>
      <label :class="[field, 'w-full']">
        <input
          type="text"
          aria-label="Chart title"
          placeholder="No title"
          :maxlength="CHART_TEXT_MAX_LENGTH"
          :class="textField"
          :value="textValue('title')"
          @input="drafts.title = ($event.target as HTMLInputElement).value"
          @blur="commitText('title', 'Chart title')"
          @keydown.enter.prevent="commitText('title', 'Chart title')"
        />
      </label>
      <div :class="sub">Colour</div>
      <ColorField :model-value="colourValue('title_color')" :palette="colourChoices" label="Title colour" @open="hold" @commit="(v) => setColour('title_color', 'Title colour', v)" />
    </div>

    <div v-if="axes" :class="section">
      <div :class="label"><h3>Axes</h3></div>
      <div :class="[sub, '!mt-0']">{{ radial ? 'Categories' : 'X axis' }}</div>
      <div class="flex flex-col gap-3">
        <ToggleRow :model-value="flag('x_axis')" :label="xLabels.axis" @update:model-value="(v) => setFlag('x_axis', 'X axis', v)" />
        <label v-if="!radial" :class="[field, 'w-full']">
          <input type="text" aria-label="X axis title" placeholder="X axis title" :maxlength="CHART_TEXT_MAX_LENGTH" :class="textField" :value="textValue('x_axis_title')" @input="drafts.x_axis_title = ($event.target as HTMLInputElement).value" @blur="commitText('x_axis_title', 'X axis title')" @keydown.enter.prevent="commitText('x_axis_title', 'X axis title')" />
        </label>
        <ToggleRow :model-value="flag('x_axis_grid')" :label="xLabels.grid" @update:model-value="(v) => setFlag('x_axis_grid', 'X axis grid', v)" />
      </div>
      <div :class="sub">{{ radial ? 'Values' : 'Y axis' }}</div>
      <div class="flex flex-col gap-3">
        <ToggleRow :model-value="flag('y_axis')" :label="yLabels.axis" @update:model-value="(v) => setFlag('y_axis', 'Y axis', v)" />
        <label v-if="!radial" :class="[field, 'w-full']">
          <input type="text" aria-label="Y axis title" placeholder="Y axis title" :maxlength="CHART_TEXT_MAX_LENGTH" :class="textField" :value="textValue('y_axis_title')" @input="drafts.y_axis_title = ($event.target as HTMLInputElement).value" @blur="commitText('y_axis_title', 'Y axis title')" @keydown.enter.prevent="commitText('y_axis_title', 'Y axis title')" />
        </label>
        <ToggleRow :model-value="flag('y_axis_grid')" :label="yLabels.grid" @update:model-value="(v) => setFlag('y_axis_grid', 'Y axis grid', v)" />
      </div>
    </div>

    <div :class="section">
      <div :class="label"><h3>Legend</h3></div>
      <ToggleRow :model-value="legendOn" label="Show legend" @update:model-value="(v) => apply('Legend', (c) => setChartField(c, 'legend', v))">
        <ColorField :model-value="colourValue('legend_color')" :palette="colourChoices" label="Legend colour" @open="hold" @commit="(v) => setColour('legend_color', 'Legend colour', v)" />
      </ToggleRow>
    </div>

    <div :class="section">
      <div :class="label"><h3>Data labels</h3></div>
      <SegmentedControl :model-value="labelValue" :options="LABELS" label="Data labels" @update:model-value="setLabels" />
    </div>

    <div v-if="axes" :class="section">
      <div :class="label"><h3>Frame</h3></div>
      <div :class="[sub, '!mt-0']">Axis colour</div>
      <ColorField :model-value="colourValue('axis_color')" :palette="colourChoices" label="Axis colour" @open="hold" @commit="(v) => setColour('axis_color', 'Axis colour', v)" />
      <div :class="sub">Grid colour</div>
      <ColorField :model-value="colourValue('grid_color')" :palette="colourChoices" label="Grid colour" @open="hold" @commit="(v) => setColour('grid_color', 'Grid colour', v)" />
    </div>
  </template>
</template>
