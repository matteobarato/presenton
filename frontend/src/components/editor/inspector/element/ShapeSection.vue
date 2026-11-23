<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import type { Presentation } from '@/api/types'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import NumberField from '@/components/editor/inspector/controls/NumberField.vue'
import SegmentedControl from '@/components/editor/inspector/controls/SegmentedControl.vue'
import SliderField from '@/components/editor/inspector/controls/SliderField.vue'
import { label, muted, section } from '@/components/editor/inspector/controls/styles'
import ToggleRow from '@/components/editor/inspector/controls/ToggleRow.vue'
import { useShapeControls } from './useShapeControls'

const { t } = useI18n()

const props = defineProps<{ presentation: Presentation }>()

const { style, palette, hold, toggleFill, toggleStroke, fillColor, fillOpacity, strokeColor, strokeWidth, strokeDash, cornerRadius, curve } =
  useShapeControls(() => props.presentation)

const DASHES = ['solid', 'dashed', 'dotted'] as const
const dashOptions = computed(() => DASHES.map((value) => ({ value, label: t(`editorInspector.element.shape.dash.${value}`) })))
const CURVES = ['none', 'smooth'] as const
const curveOptions = computed(() => CURVES.map((value) => ({ value, label: t(`editorInspector.element.shape.curve.${value}`) })))
const sub = 'mb-2 mt-4 text-[10px] text-tx-9aa9b0'
</script>

<template>
  <div v-if="style" :class="section">
    <div :class="label"><h3>{{ t('editorInspector.element.shape.title') }}</h3></div>
    <ToggleRow :model-value="style.fillEnabled" :label="t('editorInspector.element.shape.fill')" @update:model-value="toggleFill">
      <ColorField :model-value="style.fill.color" :palette="palette" :label="t('editorInspector.element.shape.fillColour')" @open="hold" @commit="fillColor" />
      <div :class="sub">{{ t('editorInspector.element.shape.opacity') }}</div>
      <SliderField :model-value="Math.round(style.fill.opacity * 100)" :label="t('editorInspector.element.shape.opacity')" :min="0" :max="100" unit="%" @focus="hold" @commit="fillOpacity" />
    </ToggleRow>

    <ToggleRow class="mt-5" :model-value="style.strokeEnabled" :label="t('editorInspector.element.shape.stroke')" @update:model-value="toggleStroke">
      <ColorField :model-value="style.stroke.color" :palette="palette" :label="t('editorInspector.element.shape.strokeColour')" @open="hold" @commit="strokeColor" />
      <div :class="sub">{{ t('editorInspector.element.shape.width') }}</div>
      <NumberField :model-value="style.stroke.width" :label="t('editorInspector.element.shape.width')" :min="0" :max="40" :step="0.5" unit="px" @focus="hold" @commit="strokeWidth" />
      <div :class="sub">{{ t('editorInspector.element.shape.dash.title') }}</div>
      <SegmentedControl :model-value="style.dash" :options="dashOptions" :label="t('editorInspector.element.shape.dash.title')" @update:model-value="strokeDash" />
    </ToggleRow>

    <template v-if="style.canRoundCorners">
      <div :class="[sub, 'mt-5']">{{ t('editorInspector.element.shape.cornerRadius') }}</div>
      <NumberField :model-value="Math.round(style.radius * 10) / 10" :label="t('editorInspector.element.shape.cornerRadius')" :min="0" :max="style.maxRadius" unit="px" @focus="hold" @commit="cornerRadius" />
    </template>

    <div :class="[label, 'mt-5']">
      <h3>{{ t('editorInspector.element.shape.curve.title') }}</h3>
      <span :class="muted">{{ style.curve === 'smooth' ? t('editorInspector.element.shape.curve.smooth') : t('editorInspector.element.shape.curve.none') }}</span>
    </div>
    <SegmentedControl :model-value="style.curve" :options="curveOptions" :label="t('editorInspector.element.shape.curve.title')" @update:model-value="curve" />
  </div>
</template>
