<script setup lang="ts">
import type { Presentation } from '@/api/types'
import { useTableControls } from '@/components/editor/inspector/element/useTableControls'
import BarColor from './BarColor.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Bar control: background of the picked cell (only shown once a cell is picked, like the Section's Cell group).
const props = defineProps<{ presentation: Presentation }>()
const { cell, palette, cellColor, hold, cellBackground } = useTableControls(() => props.presentation)
</script>

<template>
  <BarColor
    v-if="cell"
    id="cell-fill"
    :label="t('editorCanvas.controls.cell.background')"
    :value="cellColor"
    :palette="palette"
    :none-label="t('editorCanvas.controls.cell.noBackground')"
    @open="hold"
    @pick="cellBackground"
    @none="cellBackground(null)"
  />
</template>
