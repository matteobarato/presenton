<script setup lang="ts">
import { reactive } from 'vue'
import { ArrowLeftRight } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import MarkerGlyph from './MarkerGlyph.vue'
import NumberField from '@/components/editor/inspector/controls/NumberField.vue'
import SegmentedControl from '@/components/editor/inspector/controls/SegmentedControl.vue'
import { field, label, section, segment } from '@/components/editor/inspector/controls/styles'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { VECTOR_MARKERS, type VectorMarker } from '@/slide-editor/elementStyle'
import { useShapeControls } from './useShapeControls'

const props = defineProps<{ presentation: Presentation }>()

const { style, markers, palette, hold, strokeColor: color, strokeWidth: width, strokeDash: dash, setMarker, swap } = useShapeControls(() => props.presentation)

const ENDS = [
  { side: 'start', label: 'Start' },
  { side: 'end', label: 'End' },
] as const
const open = reactive({ start: false, end: false })
const labelOf = (marker: VectorMarker) => VECTOR_MARKERS.find((m) => m.value === marker)?.label ?? 'None'

function pick(side: 'start' | 'end', marker: VectorMarker) {
  open[side] = false
  setMarker(side, marker)
}

const DASHES = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
]
const sub = 'mb-2 mt-4 text-[10px] text-tx-9aa9b0'
</script>

<template>
  <div v-if="style && markers" :class="section">
    <div :class="label"><h3>Line</h3></div>
    <ColorField :model-value="style.stroke.color" :palette="palette" label="Colour" @open="hold" @commit="color" />
    <div :class="sub">Width</div>
    <NumberField :model-value="style.stroke.width" label="Width" :min="0" :max="40" :step="0.5" unit="px" @focus="hold" @commit="width" />
    <div :class="sub">Dash</div>
    <SegmentedControl :model-value="style.dash" :options="DASHES" label="Dash" @update:model-value="dash" />

    <div :class="[label, 'mt-5']"><h3>Line ends</h3></div>
    <div class="flex items-end gap-2">
      <div v-for="end in ENDS" :key="end.side" class="min-w-0 flex-1">
        <div class="mb-2 text-[10px] text-tx-9aa9b0">{{ end.label }}</div>
        <Popover v-model:open="open[end.side]">
          <PopoverTrigger as-child>
            <button type="button" :class="[field, 'w-full cursor-pointer']" :aria-label="end.label" aria-haspopup="listbox">
              <MarkerGlyph :marker="markers[end.side]" :side="end.side" />
              <span class="truncate">{{ labelOf(markers[end.side]) }}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent class="w-[190px] p-1.5" data-inline-edit-ignore="true">
            <ul role="listbox" :aria-label="`${end.label} marker`" class="flex flex-col gap-0.5">
              <li
                v-for="m in VECTOR_MARKERS"
                :key="m.value"
                role="option"
                tabindex="0"
                :aria-selected="markers[end.side] === m.value"
                class="flex h-8 cursor-pointer items-center gap-2.5 rounded-control px-2 text-[10px] text-tx-dce3e7 hover:bg-ov/[0.06]"
                :class="markers[end.side] === m.value && 'bg-sx-303c42 text-tx-c4e4f4'"
                @click="pick(end.side, m.value)"
                @keydown.enter.prevent="pick(end.side, m.value)"
                @keydown.space.prevent="pick(end.side, m.value)"
              >
                <MarkerGlyph :marker="m.value" :side="end.side" />
                {{ m.label }}
              </li>
            </ul>
          </PopoverContent>
        </Popover>
      </div>
      <button type="button" :class="[segment, 'size-[34px] flex-none']" aria-label="Swap ends" title="Swap ends" @click="swap">
        <ArrowLeftRight class="size-4" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
