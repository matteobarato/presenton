<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref } from 'vue'
import type { Presentation } from '@/api/types'
import type { ChartElement, DataLabelPosition } from '@/render/legacy/components/slide-editor/types'
import { CHART_SYSTEM_COLORS, CHART_TEXT_MAX_LENGTH, appendChartColorTarget, removeChartColorTarget, updateChartColorTarget, limitChartText, readChartDataLabelPosition } from '@/render/legacy/components/slide-editor/charts/chart-data'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import SegmentedControl from '@/components/editor/inspector/controls/SegmentedControl.vue'
import ToggleRow from '@/components/editor/inspector/controls/ToggleRow.vue'
import { field, label, section, segment } from '@/components/editor/inspector/controls/styles'
import type { ElementSelection } from '@/slide-editor/model'
import {
  axesApply,
  chartGrid,
  defaultLegendVisible,
  isRadial,
  readChart,
  setChartField,
  setDataLabels,
  writeChart,
} from '@/slide-editor/chartOps'
import { themePalette } from '@/slide-editor/themePalette'
import { useSelectedElement } from '@/slide-editor/useSelectedElement'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import ChartColorSwatches from './ChartColorSwatches.vue'
import ChartDataDialog from './ChartDataDialog.vue'
import { useChartControls } from './useChartControls'

const { t } = useI18n()

const props = defineProps<{ presentation: Presentation }>()

const { root, raw, chart, type, options, apply, changeType } = useChartControls()
const palette = computed(() => themePalette(props.presentation))
const colourChoices = computed(() => [...new Set([...palette.value, ...CHART_SYSTEM_COLORS.map((c) => `#${c.toLowerCase()}`)])])
const { patch } = useSelectedElement(useSlideEditingContext())

/** Whether the Edit data dialog is open. */
const dataOpen = ref(false)
defineExpose({ dataOpen })

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

const TEXT_NAMES: Record<TextKey, string> = { title: 'Chart title', x_axis_title: 'X axis title', y_axis_title: 'Y axis title' }
/** Commits every pending title draft in one patch, so Edit data opens on a ui that already holds them. */
function flushText() {
  const changes = (Object.keys(TEXT_NAMES) as TextKey[]).flatMap((key) => {
    const draft = drafts.value[key]
    if (draft === undefined) return []
    delete drafts.value[key]
    const next = limitChartText(draft) || null
    return next === (chart.value?.[key] ?? null) ? [] : [{ key, next }]
  })
  if (changes.length === 0) return
  apply(changes.length === 1 ? TEXT_NAMES[changes[0]!.key] : 'Chart text', (c) => changes.reduce((acc, { key, next }) => setChartField(acc, key, next), c))
}
function toggleData() {
  if (!dataOpen.value) flushText()
  dataOpen.value = !dataOpen.value
}

type FlagKey = 'x_axis' | 'y_axis' | 'x_axis_grid' | 'y_axis_grid'
const flag = (key: FlagKey) => chart.value?.[key] ?? true
const setFlag = (key: FlagKey, name: string, v: boolean) => apply(name, (c) => setChartField(c, key, v))

const legendOn = computed(() => (chart.value ? (chart.value.legend ?? defaultLegendVisible(chart.value)) : false))

const C_KEY = 'editorInspector.element.chart.'
const LABELS = ['off', 'base', 'mid', 'top', 'outside'] as const
const labelOptions = computed(() => LABELS.map((value) => ({ value, label: t(`${C_KEY}labelPos.${value}`) })))
const labelValue = computed(() => readChartDataLabelPosition(chart.value?.data_labels) ?? 'off')
/** Builds the swatch update from the current chart at the root held when the picker opened. */
function swatchPatch(name: string, fn: (c: ChartElement) => ChartElement, fromPicker = false) {
  const at = (fromPicker ? anchor : null) ?? root.value
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

const sub = 'mb-2 mt-4 text-[10px] text-tx-9aa9b0'
const textField = 'h-full w-full min-w-0 bg-transparent text-[10px] text-tx-dce3e7 outline-none placeholder:text-tx-6f7d84'
const xLabels = computed(() =>
  radial.value
    ? { axis: t(`${C_KEY}categoryLabels`), grid: t(`${C_KEY}spokes`) }
    : { axis: t(`${C_KEY}showAxis`), grid: t(`${C_KEY}showGrid`) },
)
const yLabels = computed(() =>
  radial.value
    ? { axis: t(`${C_KEY}valueLabels`), grid: t(`${C_KEY}rings`) }
    : { axis: t(`${C_KEY}showAxis`), grid: t(`${C_KEY}showGrid`) },
)
</script>

<template>
  <template v-if="chart">
    <div :class="section">
      <div :class="label"><h3>{{ t(C_KEY + 'title') }}</h3></div>
      <label :class="[field, 'w-full']">
        <select
          :aria-label="t(C_KEY + 'type')"
          class="h-full w-full min-w-0 bg-transparent text-[10px] text-tx-dce3e7 outline-none"
          :value="type"
          @change="changeType(($event.target as HTMLSelectElement).value as ChartElement['chart_type'])"
        >
          <option v-for="o in options" :key="o.value" :value="o.value" class="bg-sx-232b2f">{{ o.label }}</option>
        </select>
      </label>
    </div>

    <div :class="section">
      <div :class="label"><h3>{{ t(C_KEY + 'data') }}</h3></div>
      <div data-chart-mini class="overflow-hidden rounded-control border border-ov/[0.06] bg-field text-[10px] text-tx-dce3e7">
        <p v-if="empty" class="px-2.5 py-2 text-tx-9aa9b0">{{ t(C_KEY + 'noData') }}</p>
        <table v-else class="w-full table-fixed">
          <thead>
            <tr class="text-left text-[9px] text-tx-9aa9b0">
              <th class="truncate px-2 py-1 font-normal" />
              <th v-for="(s, i) in mini.series" :key="i" class="truncate px-2 py-1 font-normal">{{ s.name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in mini.rows" :key="i" class="border-t border-ov/[0.05]">
              <td class="truncate px-2 py-1">{{ r.category }}</td>
              <td v-for="(v, j) in r.values" :key="j" class="truncate px-2 py-1">{{ v }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!empty && (mini.moreRows || mini.moreSeries)" class="border-t border-ov/[0.05] px-2 py-1 text-[9px] text-tx-9aa9b0">
          <template v-if="mini.moreRows">{{ t(C_KEY + 'moreRows', { count: mini.moreRows }) }}</template>
          <template v-if="mini.moreRows && mini.moreSeries">{{ t(C_KEY + 'moreSeparator') }}</template>
          <template v-if="mini.moreSeries">{{ t(C_KEY + 'moreSeries', { count: mini.moreSeries }) }}</template>
        </p>
      </div>
      <button type="button" :class="[segment, 'mt-2 w-full flex-none text-[10px]']" :aria-label="t(C_KEY + 'editData')" @mousedown.prevent @click="toggleData">{{ t(C_KEY + 'editData') }}</button>
      <ChartDataDialog v-if="root" v-model:open="dataOpen" :root="root" />
    </div>

    <div :class="section">
      <div :class="label"><h3>{{ t(C_KEY + 'colours') }}</h3></div>
      <ChartColorSwatches
        :chart="chart"
        :palette="colourChoices"
        @open="hold"
        @close="anchor = null"
        @pick="(i, c) => swatchPatch('Chart colour', (ch) => updateChartColorTarget(ch, i, c), true)"
        @add="swatchPatch('Add chart colour', appendChartColorTarget)"
        @remove="(i) => swatchPatch('Remove chart colour', (ch) => removeChartColorTarget(ch, i))"
      />
    </div>

    <div :class="section">
      <div :class="label"><h3>{{ t(C_KEY + 'titleSection') }}</h3></div>
      <label :class="[field, 'w-full']">
        <input
          type="text"
          :aria-label="t(C_KEY + 'titleAria')"
          :placeholder="t(C_KEY + 'noTitle')"
          :maxlength="CHART_TEXT_MAX_LENGTH"
          :class="textField"
          :value="textValue('title')"
          @input="drafts.title = ($event.target as HTMLInputElement).value"
          @blur="commitText('title', 'Chart title')"
          @keydown.enter.prevent="commitText('title', 'Chart title')"
        />
      </label>
      <div :class="sub">{{ t(C_KEY + 'colour') }}</div>
      <ColorField :model-value="colourValue('title_color')" :palette="colourChoices" :label="t(C_KEY + 'titleColour')" @open="hold" @close="anchor = null" @commit="(v) => setColour('title_color', 'Title colour', v)" />
    </div>

    <div v-if="axes" :class="section">
      <div :class="label"><h3>{{ t(C_KEY + 'axes') }}</h3></div>
      <div :class="[sub, '!mt-0']">{{ radial ? t(C_KEY + 'categories') : t(C_KEY + 'xAxis') }}</div>
      <div class="flex flex-col gap-3">
        <ToggleRow :model-value="flag('x_axis')" :label="xLabels.axis" @update:model-value="(v) => setFlag('x_axis', 'X axis', v)" />
        <label v-if="!radial" :class="[field, 'w-full']">
          <input type="text" :aria-label="t(C_KEY + 'xAxisTitle')" :placeholder="t(C_KEY + 'xAxisTitle')" :maxlength="CHART_TEXT_MAX_LENGTH" :class="textField" :value="textValue('x_axis_title')" @input="drafts.x_axis_title = ($event.target as HTMLInputElement).value" @blur="commitText('x_axis_title', 'X axis title')" @keydown.enter.prevent="commitText('x_axis_title', 'X axis title')" />
        </label>
        <ToggleRow :model-value="flag('x_axis_grid')" :label="xLabels.grid" @update:model-value="(v) => setFlag('x_axis_grid', 'X axis grid', v)" />
      </div>
      <div :class="sub">{{ radial ? t(C_KEY + 'values') : t(C_KEY + 'yAxis') }}</div>
      <div class="flex flex-col gap-3">
        <ToggleRow :model-value="flag('y_axis')" :label="yLabels.axis" @update:model-value="(v) => setFlag('y_axis', 'Y axis', v)" />
        <label v-if="!radial" :class="[field, 'w-full']">
          <input type="text" :aria-label="t(C_KEY + 'yAxisTitle')" :placeholder="t(C_KEY + 'yAxisTitle')" :maxlength="CHART_TEXT_MAX_LENGTH" :class="textField" :value="textValue('y_axis_title')" @input="drafts.y_axis_title = ($event.target as HTMLInputElement).value" @blur="commitText('y_axis_title', 'Y axis title')" @keydown.enter.prevent="commitText('y_axis_title', 'Y axis title')" />
        </label>
        <ToggleRow :model-value="flag('y_axis_grid')" :label="yLabels.grid" @update:model-value="(v) => setFlag('y_axis_grid', 'Y axis grid', v)" />
      </div>
    </div>

    <div :class="section">
      <div :class="label"><h3>{{ t(C_KEY + 'legend') }}</h3></div>
      <ToggleRow :model-value="legendOn" :label="t(C_KEY + 'showLegend')" @update:model-value="(v) => apply('Legend', (c) => setChartField(c, 'legend', v))">
        <ColorField :model-value="colourValue('legend_color')" :palette="colourChoices" :label="t(C_KEY + 'legendColour')" @open="hold" @close="anchor = null" @commit="(v) => setColour('legend_color', 'Legend colour', v)" />
      </ToggleRow>
    </div>

    <div :class="section">
      <div :class="label"><h3>{{ t(C_KEY + 'dataLabels') }}</h3></div>
      <SegmentedControl :model-value="labelValue" :options="labelOptions" :label="t(C_KEY + 'dataLabels')" @update:model-value="setLabels" />
    </div>

    <div v-if="axes" :class="section">
      <div :class="label"><h3>{{ t(C_KEY + 'frame') }}</h3></div>
      <div :class="[sub, '!mt-0']">{{ t(C_KEY + 'axisColour') }}</div>
      <ColorField :model-value="colourValue('axis_color')" :palette="colourChoices" :label="t(C_KEY + 'axisColour')" @open="hold" @close="anchor = null" @commit="(v) => setColour('axis_color', 'Axis colour', v)" />
      <div :class="sub">{{ t(C_KEY + 'gridColour') }}</div>
      <ColorField :model-value="colourValue('grid_color')" :palette="colourChoices" :label="t(C_KEY + 'gridColour')" @open="hold" @close="anchor = null" @commit="(v) => setColour('grid_color', 'Grid colour', v)" />
    </div>
  </template>
</template>
