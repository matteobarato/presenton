<script setup lang="ts">
import { ref } from 'vue'
import { Table2 } from 'lucide-vue-next'
import { tool } from '@/components/editor/canvas/toolbars/toolbarClasses'
import ChartDataDialog from '@/components/editor/inspector/element/ChartDataDialog.vue'
import { useChartControls } from '@/components/editor/inspector/element/useChartControls'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Bar control: Edit data. Owns the data dialog, so it stays mounted while the bar is shown.
const { root, chart } = useChartControls()
const open = ref(false)
</script>

<template>
  <button
    v-if="chart"
    type="button"
    :class="tool"
    :aria-label="t('editorCanvas.controls.chart.editData')"
    :title="t('editorCanvas.controls.chart.editData')"
    data-bar-item="chart-edit-data"
    @mousedown.prevent
    @click="open = true"
  >
    <Table2 class="size-4" aria-hidden="true" />
  </button>
  <ChartDataDialog v-if="root" v-model:open="open" :root="root" />
</template>
