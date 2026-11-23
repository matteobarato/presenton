<script setup lang="ts">
import type { ChartElement } from '@/render/legacy/components/slide-editor/types'
import { useChartControls } from '@/components/editor/inspector/element/useChartControls'

// Bar control: chart type selector.
const { chart, type, options, changeType } = useChartControls()
</script>

<template>
  <select
    v-if="chart"
    aria-label="Chart type"
    title="Chart type"
    data-bar-item="chart-type"
    class="h-[31px] max-w-[130px] rounded-control bg-transparent px-1.5 text-[11px] text-tx-dce3e7 outline-none hover:bg-sx-30373b focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
    :value="type"
    @change="changeType(($event.target as HTMLSelectElement).value as ChartElement['chart_type'])"
  >
    <option v-for="o in options" :key="o.value" :value="o.value" class="bg-sx-232b2f">{{ o.label }}</option>
  </select>
</template>
