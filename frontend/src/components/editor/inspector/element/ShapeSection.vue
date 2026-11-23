<script setup lang="ts">
import type { Presentation } from '@/api/types'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import NumberField from '@/components/editor/inspector/controls/NumberField.vue'
import SegmentedControl from '@/components/editor/inspector/controls/SegmentedControl.vue'
import SliderField from '@/components/editor/inspector/controls/SliderField.vue'
import { label, muted, section } from '@/components/editor/inspector/controls/styles'
import ToggleRow from '@/components/editor/inspector/controls/ToggleRow.vue'
import { useShapeControls } from './useShapeControls'

const props = defineProps<{ presentation: Presentation }>()

const { style, palette, hold, toggleFill, toggleStroke, fillColor, fillOpacity, strokeColor, strokeWidth, strokeDash, cornerRadius, curve } =
  useShapeControls(() => props.presentation)

const DASHES = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
]
const CURVES = [
  { value: 'none', label: 'Sharp' },
  { value: 'smooth', label: 'Smooth' },
]
const sub = 'mb-2 mt-4 text-[10px] text-tx-9aa9b0'
</script>

<template>
  <div v-if="style" :class="section">
    <div :class="label"><h3>Shape</h3></div>
    <ToggleRow :model-value="style.fillEnabled" label="Fill" @update:model-value="toggleFill">
      <ColorField :model-value="style.fill.color" :palette="palette" label="Fill colour" @open="hold" @commit="fillColor" />
      <div :class="sub">Opacity</div>
      <SliderField :model-value="Math.round(style.fill.opacity * 100)" label="Opacity" :min="0" :max="100" unit="%" @focus="hold" @commit="fillOpacity" />
    </ToggleRow>

    <ToggleRow class="mt-5" :model-value="style.strokeEnabled" label="Stroke" @update:model-value="toggleStroke">
      <ColorField :model-value="style.stroke.color" :palette="palette" label="Stroke colour" @open="hold" @commit="strokeColor" />
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
