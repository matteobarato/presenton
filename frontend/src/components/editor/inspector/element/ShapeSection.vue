<script setup lang="ts">
import { computed, watch } from 'vue'
import type { Presentation } from '@/api/types'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import NumberField from '@/components/editor/inspector/controls/NumberField.vue'
import SegmentedControl from '@/components/editor/inspector/controls/SegmentedControl.vue'
import SliderField from '@/components/editor/inspector/controls/SliderField.vue'
import { label, muted, section } from '@/components/editor/inspector/controls/styles'
import ToggleRow from '@/components/editor/inspector/controls/ToggleRow.vue'
import {
  DEFAULT_FILL,
  DEFAULT_STROKE,
  readShapeStyle,
  setCornerRadius,
  setCurve,
  setDash,
  setFill,
  setStroke,
  type DashStyle,
} from '@/slide-editor/elementStyle'
import type { ElementSelection } from '@/slide-editor/model'
import { themePalette } from '@/slide-editor/themePalette'
import { useSelectedElement } from '@/slide-editor/useSelectedElement'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

const props = defineProps<{ presentation: Presentation }>()

const ctx = useSlideEditingContext()
const { element, patch, capture } = useSelectedElement(ctx)
const style = computed(() => (element.value ? readShapeStyle(element.value) : null))
const palette = computed(() => themePalette(props.presentation))

// The target at the moment a colour popover opened or a number field took focus:
// the commit lands there even if the selection moves before it fires.
let anchor: ElementSelection | null = null
// A focus anchor dies when the selection moves; a popover anchor survives it until the commit.
// Either is consumed by the commit it was held for.
let sticky = false
const hold = () => {
  anchor = capture()
  sticky = false
}
const holdOpen = () => {
  anchor = capture()
  sticky = true
}
const at = () => {
  const held = anchor ?? undefined
  anchor = null
  return held
}
watch(
  () => ctx.selection.value,
  () => {
    if (!sticky) anchor = null
  },
)

// Turning Fill/Stroke back on restores what the element had when it was turned off.
const lastFill = new Map<string, { color: string; opacity: number }>()
const lastStroke = new Map<string, { color: string; opacity: number; width: number }>()
const keyOf = () => JSON.stringify(capture())

function toggleFill(on: boolean) {
  const s = style.value
  if (!s) return
  if (!on) lastFill.set(keyOf(), s.fill)
  const restored = lastFill.get(keyOf()) ?? DEFAULT_FILL
  patch('Fill', (el) => setFill(el, on ? restored : null))
}
function toggleStroke(on: boolean) {
  const s = style.value
  if (!s) return
  if (!on) lastStroke.set(keyOf(), { color: s.stroke.color, opacity: s.stroke.opacity, width: s.stroke.width })
  const restored = lastStroke.get(keyOf()) ?? DEFAULT_STROKE
  patch('Stroke', (el) => setStroke(el, on ? restored : null))
}

const fillColor = (color: string | null) => color && patch('Fill', (el) => setFill(el, { ...readShapeStyle(el).fill, color }), at())
const fillOpacity = (percent: number) => patch('Fill', (el) => setFill(el, { ...readShapeStyle(el).fill, opacity: percent / 100 }), at())
const strokeColor = (color: string | null) => color && patch('Stroke', (el) => setStroke(el, { color }), at())
const strokeWidth = (width: number) => patch('Stroke', (el) => setStroke(el, { width }), at())
const strokeDash = (dash: string) => patch('Stroke', (el) => setDash(el, dash as DashStyle))
const cornerRadius = (r: number) => patch('Corner radius', (el) => setCornerRadius(el, r), at())
const curve = (mode: string) => patch('Curve', (el) => setCurve(el, mode as 'none' | 'smooth'))

const DASHES = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
]
const CURVES = [
  { value: 'none', label: 'Sharp' },
  { value: 'smooth', label: 'Smooth' },
]
const sub = 'mb-2 mt-4 text-[10px] text-[#9aa9b0]'
</script>

<template>
  <div v-if="style" :class="section">
    <div :class="label"><h3>Shape</h3></div>
    <ToggleRow :model-value="style.fillEnabled" label="Fill" @update:model-value="toggleFill">
      <ColorField :model-value="style.fill.color" :palette="palette" label="Fill colour" @open="holdOpen" @commit="fillColor" />
      <div :class="sub">Opacity</div>
      <SliderField :model-value="Math.round(style.fill.opacity * 100)" label="Opacity" :min="0" :max="100" unit="%" @focus="hold" @commit="fillOpacity" />
    </ToggleRow>

    <ToggleRow class="mt-5" :model-value="style.strokeEnabled" label="Stroke" @update:model-value="toggleStroke">
      <ColorField :model-value="style.stroke.color" :palette="palette" label="Stroke colour" @open="holdOpen" @commit="strokeColor" />
      <div :class="sub">Width</div>
      <NumberField :model-value="style.stroke.width" label="Width" :min="0" :max="40" :step="0.5" unit="px" @focus="hold" @commit="strokeWidth" />
      <div :class="sub">Dash</div>
      <SegmentedControl :model-value="style.dash" :options="DASHES" label="Dash" @update:model-value="strokeDash" />
    </ToggleRow>

    <template v-if="style.canRoundCorners">
      <div :class="[sub, 'mt-5']">Corner radius</div>
      <NumberField :model-value="Math.round(style.radius * 10) / 10" label="Corner radius" :min="0" :max="style.maxRadius" unit="px" @focus="hold" @commit="cornerRadius" />
    </template>

    <div :class="[label, 'mt-5']">
      <h3>Curve</h3>
      <span :class="muted">{{ style.curve === 'smooth' ? 'Smooth' : 'Sharp' }}</span>
    </div>
    <SegmentedControl :model-value="style.curve" :options="CURVES" label="Curve" @update:model-value="curve" />
  </div>
</template>
