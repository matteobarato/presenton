<script setup lang="ts">
import { Minus, Plus } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { useLayoutControls } from '@/components/editor/inspector/element/useLayoutControls'
import { tool } from '@/components/editor/canvas/toolbars/toolbarClasses'

// Bar control: gap between a flex/grid layout's items (px). Containers have no gap, so nothing shows for them.
const props = defineProps<{ presentation: Presentation }>()
const { isContainer, raw, gap, hold, setGap } = useLayoutControls(() => props.presentation)

const MIN = 0
const clamp = (n: number) => Math.round(Math.max(MIN, n) * 1000) / 1000

function step(delta: number) {
  hold()
  const next = clamp(gap.value + delta)
  if (next !== gap.value) setGap(next)
}
function commit(event: Event) {
  const input = event.target as HTMLInputElement
  const n = Number(input.value)
  if (input.value.trim() === '' || !Number.isFinite(n)) {
    input.value = String(gap.value)
    return
  }
  const next = clamp(n)
  input.value = String(next)
  if (next !== gap.value) setGap(next)
}
</script>

<template>
  <template v-if="raw && !isContainer">
    <button type="button" :class="tool" aria-label="Decrease gap" title="Decrease gap" @mousedown.prevent @click="step(-1)">
      <Minus class="size-3.5" aria-hidden="true" />
    </button>
    <input
      type="number"
      :min="MIN"
      step="1"
      aria-label="Gap"
      title="Gap (px)"
      class="h-[31px] w-9 rounded-control bg-transparent text-center text-[11px] text-tx-dce3e7 outline-none [appearance:textfield] hover:bg-sx-30373b focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      :value="gap"
      data-bar-item="layout-gap"
      @focus="hold"
      @change="commit"
    />
    <button type="button" :class="tool" aria-label="Increase gap" title="Increase gap" @mousedown.prevent @click="step(1)">
      <Plus class="size-3.5" aria-hidden="true" />
    </button>
  </template>
</template>
