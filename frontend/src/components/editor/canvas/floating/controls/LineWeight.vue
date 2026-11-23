<script setup lang="ts">
import { Minus, Plus } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { useShapeControls } from '@/components/editor/inspector/element/useShapeControls'
import { tool } from '@/components/editor/canvas/toolbars/toolbarClasses'

// Bar control: line weight stepper (px). The buttons keep focus where it is.
const props = defineProps<{ presentation: Presentation }>()
const { style, hold, strokeWidth } = useShapeControls(() => props.presentation)

const MIN = 0
const MAX = 40
const width = () => style.value?.stroke.width ?? 0
const clamp = (n: number) => Math.round(Math.min(MAX, Math.max(MIN, n)) * 1000) / 1000

function step(delta: number) {
  hold()
  const next = clamp(width() + delta)
  if (next !== width()) strokeWidth(next)
}
function commit(event: Event) {
  const input = event.target as HTMLInputElement
  const n = Number(input.value)
  if (input.value.trim() === '' || !Number.isFinite(n)) {
    input.value = String(width())
    return
  }
  const next = clamp(n)
  input.value = String(next)
  if (next !== width()) strokeWidth(next)
}
</script>

<template>
  <button type="button" :class="tool" aria-label="Decrease line weight" title="Decrease line weight" @mousedown.prevent @click="step(-1)">
    <Minus class="size-3.5" aria-hidden="true" />
  </button>
  <input
    type="number"
    :min="MIN"
    :max="MAX"
    step="0.5"
    aria-label="Line weight"
    title="Line weight (px)"
    class="h-[31px] w-9 rounded-control bg-transparent text-center text-[11px] text-tx-dce3e7 outline-none [appearance:textfield] hover:bg-sx-30373b focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    :value="width()"
    data-bar-item="line-weight"
    @focus="hold"
    @change="commit"
  />
  <button type="button" :class="tool" aria-label="Increase line weight" title="Increase line weight" @mousedown.prevent @click="step(1)">
    <Plus class="size-3.5" aria-hidden="true" />
  </button>
</template>
