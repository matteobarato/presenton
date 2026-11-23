<script setup lang="ts">
import { Minus, Plus } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { useTextControls } from '@/components/editor/inspector/element/useTextControls'
import { tool } from '@/components/editor/canvas/toolbars/toolbarClasses'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Bar control: font size stepper. The buttons keep focus where it is (inline editor selection).
const props = defineProps<{ presentation: Presentation }>()
const { size, setSize } = useTextControls(props)

function commit(event: Event) {
  const input = event.target as HTMLInputElement
  if (!setSize(input.value)) input.value = String(size.value)
}
</script>

<template>
  <button type="button" :class="tool" :aria-label="t('editorCanvas.controls.font.decreaseSize')" :title="t('editorCanvas.controls.font.decreaseSize')" @mousedown.prevent @click="setSize(size - 1)">
    <Minus class="size-3.5" aria-hidden="true" />
  </button>
  <input
    type="number"
    min="8"
    max="200"
    :aria-label="t('editorCanvas.controls.font.size')"
    :title="t('editorCanvas.controls.font.size')"
    class="h-[31px] w-9 rounded-control bg-transparent text-center text-[11px] text-tx-dce3e7 outline-none [appearance:textfield] hover:bg-sx-30373b focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    :value="size"
    data-bar-item="font-size"
    @change="commit"
  />
  <button type="button" :class="tool" :aria-label="t('editorCanvas.controls.font.increaseSize')" :title="t('editorCanvas.controls.font.increaseSize')" @mousedown.prevent @click="setSize(size + 1)">
    <Plus class="size-3.5" aria-hidden="true" />
  </button>
</template>
