<script setup lang="ts">
import { computed } from 'vue'
import {
  BarChart3,
  Box,
  ChevronRight,
  Component,
  Group,
  Image,
  LayoutGrid,
  List,
  Shapes,
  Sparkles,
  Square,
  Table,
  Type,
} from 'lucide-vue-next'
import type { LayerNode } from '@/slide-editor/layerTree'

const props = withDefaults(
  defineProps<{ node: LayerNode; depth?: number; expanded?: boolean; expandable?: boolean; selected?: boolean }>(),
  { depth: 0, expanded: false, expandable: false, selected: false },
)
const emit = defineEmits<{ select: []; toggle: []; hover: [on: boolean] }>()

const ICONS: Record<string, typeof Type> = {
  text: Type,
  'text-list': List,
  image: Image,
  chart: BarChart3,
  table: Table,
  group: Group,
  flex: LayoutGrid,
  grid: LayoutGrid,
  'list-view': LayoutGrid,
  'grid-view': LayoutGrid,
  container: Square,
  vector: Shapes,
  smooth: Shapes,
  infographic: Sparkles,
  component: Component,
}
const icon = computed(() => ICONS[props.node.type] ?? Box)
</script>

<template>
  <div
    class="group flex h-8 items-center rounded-control text-[10px] text-[#c6ced3] hover:bg-white/[0.04] hover:text-white min-[1600px]:text-[11px]"
    :class="selected && 'bg-white/[0.06] text-white'"
    :style="{ paddingLeft: `${depth * 14}px` }"
    data-layer-row
    @mouseenter="emit('hover', true)"
    @mouseleave="emit('hover', false)"
  >
    <button
      v-if="expandable"
      type="button"
      class="inline-flex size-6 shrink-0 items-center justify-center rounded-control text-[#9aa9b0] hover:text-white"
      :aria-label="expanded ? `Collapse ${node.label}` : `Expand ${node.label}`"
      :aria-expanded="expanded"
      tabindex="-1"
      @mousedown.prevent
      @click="emit('toggle')"
    >
      <ChevronRight class="size-3.5 transition-transform" :class="expanded && 'rotate-90'" aria-hidden="true" />
    </button>
    <span v-else class="size-6 shrink-0" aria-hidden="true" />
    <button
      type="button"
      class="flex h-full min-w-0 flex-1 items-center gap-2 pr-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-[#4bb3e6] rounded-control"
      data-layer-select
      :aria-current="selected ? 'true' : undefined"
      @mousedown.prevent
      @click="emit('select')"
    >
      <component :is="icon" class="size-3.5 shrink-0 text-[#9aa9b0]" aria-hidden="true" />
      <span class="shrink-0 font-medium">{{ node.label }}</span>
      <span v-if="node.detail" class="truncate text-[#7f8c93]">{{ node.detail }}</span>
    </button>
  </div>
</template>
