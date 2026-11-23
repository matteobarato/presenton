<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, reactive } from 'vue'
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

const { t } = useI18n()

const props = defineProps<{ presentation: Presentation }>()

const { style, markers, palette, hold, strokeColor: color, strokeWidth: width, strokeDash: dash, setMarker, swap } = useShapeControls(() => props.presentation)

const ENDS = ['start', 'end'] as const
const open = reactive({ start: false, end: false })
const labelOf = (marker: VectorMarker) => VECTOR_MARKERS.find((m) => m.value === marker)?.label ?? t('editorInspector.element.line.none')

function pick(side: 'start' | 'end', marker: VectorMarker) {
  open[side] = false
  setMarker(side, marker)
}

const DASHES = ['solid', 'dashed', 'dotted'] as const
const dashOptions = computed(() => DASHES.map((value) => ({ value, label: t(`editorInspector.element.line.dash.${value}`) })))
const sub = 'mb-2 mt-4 text-[10px] text-tx-9aa9b0'
</script>

<template>
  <div v-if="style && markers" :class="section">
    <div :class="label"><h3>{{ t('editorInspector.element.line.title') }}</h3></div>
    <ColorField :model-value="style.stroke.color" :palette="palette" :label="t('editorInspector.element.line.colour')" @open="hold" @commit="color" />
    <div :class="sub">{{ t('editorInspector.element.line.width') }}</div>
    <NumberField :model-value="style.stroke.width" :label="t('editorInspector.element.line.width')" :min="0" :max="40" :step="0.5" unit="px" @focus="hold" @commit="width" />
    <div :class="sub">{{ t('editorInspector.element.line.dash.title') }}</div>
    <SegmentedControl :model-value="style.dash" :options="dashOptions" :label="t('editorInspector.element.line.dash.title')" @update:model-value="dash" />

    <div :class="[label, 'mt-5']"><h3>{{ t('editorInspector.element.line.ends.title') }}</h3></div>
    <div class="flex items-end gap-2">
      <div v-for="end in ENDS" :key="end" class="min-w-0 flex-1">
        <div class="mb-2 text-[10px] text-tx-9aa9b0">{{ t(`editorInspector.element.line.ends.${end}`) }}</div>
        <Popover v-model:open="open[end]">
          <PopoverTrigger as-child>
            <button type="button" :class="[field, 'w-full cursor-pointer']" :aria-label="t(`editorInspector.element.line.ends.${end}`)" aria-haspopup="listbox">
              <MarkerGlyph :marker="markers[end]" :side="end" />
              <span class="truncate">{{ labelOf(markers[end]) }}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent class="w-[190px] p-1.5" data-inline-edit-ignore="true">
            <ul role="listbox" :aria-label="t('editorInspector.element.line.markerList', { end: t(`editorInspector.element.line.ends.${end}`) })" class="flex flex-col gap-0.5">
              <li
                v-for="m in VECTOR_MARKERS"
                :key="m.value"
                role="option"
                tabindex="0"
                :aria-selected="markers[end] === m.value"
                class="flex h-8 cursor-pointer items-center gap-2.5 rounded-control px-2 text-[10px] text-tx-dce3e7 hover:bg-ov/[0.06]"
                :class="markers[end] === m.value && 'bg-sx-303c42 text-tx-c4e4f4'"
                @click="pick(end, m.value)"
                @keydown.enter.prevent="pick(end, m.value)"
                @keydown.space.prevent="pick(end, m.value)"
              >
                <MarkerGlyph :marker="m.value" :side="end" />
                {{ m.label }}
              </li>
            </ul>
          </PopoverContent>
        </Popover>
      </div>
      <button type="button" :class="[segment, 'size-[34px] flex-none']" :aria-label="t('editorInspector.element.line.swap')" :title="t('editorInspector.element.line.swap')" @click="swap">
        <ArrowLeftRight class="size-4" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
