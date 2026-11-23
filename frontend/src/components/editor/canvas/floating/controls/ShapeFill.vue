<script setup lang="ts">
import type { Presentation } from '@/api/types'
import { useShapeControls } from '@/components/editor/inspector/element/useShapeControls'
import BarColor from './BarColor.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Bar control: shape fill colour (the popover's "No fill" turns the fill off, as the Fill switch does).
const props = defineProps<{ presentation: Presentation }>()
const { style, palette, hold, fillColor, toggleFill } = useShapeControls(() => props.presentation)
</script>

<template>
  <BarColor
    id="fill-color"
    :label="t('editorCanvas.controls.shape.fillColour')"
    :value="style?.fillEnabled ? style.fill.color : null"
    :palette="palette"
    :none-label="t('editorCanvas.controls.shape.noFill')"
    @open="hold"
    @pick="fillColor"
    @none="toggleFill(false)"
  />
</template>
