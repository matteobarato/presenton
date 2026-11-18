<script setup lang="ts">
import type { Presentation } from '@/api/types'
import { useShapeControls } from '@/components/editor/inspector/element/useShapeControls'
import BarColor from './BarColor.vue'

// Bar control: line colour.
const props = defineProps<{ presentation: Presentation }>()
const { style, palette, hold, strokeColor } = useShapeControls(() => props.presentation)
</script>

<template>
  <BarColor id="line-color" label="Line colour" :value="style?.stroke.color ?? null" :palette="palette" @open="hold" @pick="strokeColor" />
</template>
