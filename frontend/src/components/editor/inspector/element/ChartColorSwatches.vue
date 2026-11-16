<script setup lang="ts">
import { computed } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import type { ChartElement } from '@/render/legacy/components/slide-editor/types'
import {
  CHART_SYSTEM_COLORS,
  appendChartColorTarget,
  removeChartColorTarget,
  resolvedChartColorTargets,
  updateChartColorTarget,
} from '@/render/legacy/components/slide-editor/charts/chart-data'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import { segment } from '@/components/editor/inspector/controls/styles'

const props = defineProps<{ chart: ChartElement; palette: string[] }>()
const emit = defineEmits<{ change: [next: ChartElement] }>()

const targets = computed(() => resolvedChartColorTargets(props.chart))
const colours = computed(() => [...new Set([...props.palette, ...CHART_SYSTEM_COLORS.map((c) => `#${c.toLowerCase()}`)])])
const canAdd = computed(() => targets.value.length < 12)
const canRemove = computed(() => targets.value.length > 1)

// The chart at the moment a colour popover opened, so a late commit lands on it.
let held: ChartElement | null = null
const hold = () => (held = props.chart)
function pick(index: number, value: string | null) {
  const base = held ?? props.chart
  held = null
  if (value) emit('change', updateChartColorTarget(base, index, value))
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-for="t in targets" :key="t.index" class="flex items-center gap-2">
      <div class="min-w-0 flex-1">
        <ColorField
          :model-value="`#${t.color.toLowerCase()}`"
          :palette="colours"
          :label="`Chart colour ${t.index + 1}`"
          @open="hold"
          @commit="(v) => pick(t.index, v)"
        />
      </div>
      <span class="w-16 shrink-0 truncate text-[9px] text-[#9aa9b0]" :title="t.label">{{ t.label }}</span>
    </div>
    <div class="flex gap-2">
      <button type="button" :class="[segment, 'disabled:cursor-not-allowed disabled:opacity-40']" aria-label="Add chart colour" title="Add chart colour" :disabled="!canAdd" @mousedown.prevent @click="emit('change', appendChartColorTarget(chart))">
        <Plus class="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        :class="[segment, 'disabled:cursor-not-allowed disabled:opacity-40']"
        aria-label="Remove chart colour"
        title="Remove the last chart colour"
        :disabled="!canRemove"
        @mousedown.prevent
        @click="emit('change', removeChartColorTarget(chart, targets.length - 1))"
      >
        <X class="size-4" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
