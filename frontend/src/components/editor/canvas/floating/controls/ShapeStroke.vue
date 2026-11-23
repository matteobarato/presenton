<script setup lang="ts">
import type { Presentation } from '@/api/types'
import { useShapeControls } from '@/components/editor/inspector/element/useShapeControls'
import BarColor from './BarColor.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Bar control: shape stroke colour (the popover's "No stroke" turns the stroke off, as the Stroke switch does).
const props = defineProps<{ presentation: Presentation }>()
const { style, palette, hold, strokeColor, toggleStroke } = useShapeControls(() => props.presentation)
</script>

<template>
  <BarColor
    id="stroke-color"
    :label="t('editorCanvas.controls.shape.strokeColour')"
    :value="style?.strokeEnabled ? style.stroke.color : null"
    :palette="palette"
    :none-label="t('editorCanvas.controls.shape.noStroke')"
    @open="hold"
    @pick="strokeColor"
    @none="toggleStroke(false)"
  />
</template>
