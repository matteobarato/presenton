<script setup lang="ts">
import type { Presentation } from '@/api/types'
import { useShapeControls } from '@/components/editor/inspector/element/useShapeControls'
import BarColor from './BarColor.vue'

// Bar control: shape stroke colour (the popover's "No stroke" turns the stroke off, as the Stroke switch does).
const props = defineProps<{ presentation: Presentation }>()
const { style, palette, hold, strokeColor, toggleStroke } = useShapeControls(() => props.presentation)
</script>

<template>
  <BarColor
    id="stroke-color"
    label="Stroke colour"
    :value="style?.strokeEnabled ? style.stroke.color : null"
    :palette="palette"
    none-label="No stroke"
    @open="hold"
    @pick="strokeColor"
    @none="toggleStroke(false)"
  />
</template>
