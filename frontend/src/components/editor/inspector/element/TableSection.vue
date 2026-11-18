<script setup lang="ts">
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import SegmentedControl from '@/components/editor/inspector/controls/SegmentedControl.vue'
import { label, section, segment } from '@/components/editor/inspector/controls/styles'
import TextSection from './TextSection.vue'
import { useTableControls } from './useTableControls'

const props = defineProps<{ presentation: Presentation }>()

const { table, cell, palette, textTarget, structure, hold, cellBackground, alignment, cellColor, setAlignment } = useTableControls(() => props.presentation)

const ALIGNS = [
  { value: 'left', label: 'Cell align left', icon: AlignLeft },
  { value: 'center', label: 'Cell align center', icon: AlignCenter },
  { value: 'right', label: 'Cell align right', icon: AlignRight },
]

const sub = 'mb-2 mt-4 text-[10px] text-[#9aa9b0]'
</script>

<template>
  <template v-if="table">
    <div :class="section">
      <div :class="label"><h3>Table</h3></div>
      <div class="grid grid-cols-6 gap-2">
        <button
          v-for="s in structure"
          :key="s.label"
          type="button"
          :class="[segment, 'disabled:cursor-not-allowed disabled:opacity-40']"
          :aria-label="s.label"
          :title="s.ok ? s.label : s.why"
          :disabled="!s.ok"
          @mousedown.prevent
          @click="s.run()"
        >
          <component :is="s.icon" class="size-4" aria-hidden="true" />
        </button>
      </div>
      <template v-if="cell">
        <div :class="[label, 'mt-5']">
          <h3>Cell</h3>
        </div>
        <ColorField :model-value="cellColor" :palette="palette" label="Cell background" allow-none @open="hold" @commit="cellBackground" />
        <div :class="sub">Alignment</div>
        <SegmentedControl :model-value="alignment" :options="ALIGNS" label="Cell alignment" @update:model-value="setAlignment" />
      </template>
    </div>
    <TextSection :presentation="props.presentation" :target="textTarget" />
  </template>
</template>
