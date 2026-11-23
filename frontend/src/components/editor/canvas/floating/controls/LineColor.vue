<script setup lang="ts">
import type { Presentation } from '@/api/types'
import { useShapeControls } from '@/components/editor/inspector/element/useShapeControls'
import BarColor from './BarColor.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Bar control: line colour.
const props = defineProps<{ presentation: Presentation }>()
const { style, palette, hold, strokeColor } = useShapeControls(() => props.presentation)
</script>

<template>
  <BarColor id="line-color" :label="t('editorCanvas.controls.lineColour')" :value="style?.stroke.color ?? null" :palette="palette" @open="hold" @pick="strokeColor" />
</template>
