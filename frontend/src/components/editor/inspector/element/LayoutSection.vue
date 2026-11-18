<script setup lang="ts">
import type { Presentation } from '@/api/types'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import NumberField from '@/components/editor/inspector/controls/NumberField.vue'
import SliderField from '@/components/editor/inspector/controls/SliderField.vue'
import { field, label, section, segment, segmentOn } from '@/components/editor/inspector/controls/styles'
import type { Horizontal, Vertical } from '@/slide-editor/layoutOps'
import { useLayoutControls } from './useLayoutControls'

const props = defineProps<{ presentation: Presentation }>()

const {
  palette,
  raw,
  type,
  isContainer,
  gap,
  stats,
  container,
  hold,
  release,
  setGap,
  addItem,
  removeItem,
  fillColour,
  fillOpacity,
  strokeColour,
  strokeWidth,
  strokeOpacity,
  setRadius,
  align,
  setPadding,
} = useLayoutControls(() => props.presentation)

const HORIZONTALS: Horizontal[] = ['left', 'center', 'right']
const VERTICALS: Vertical[] = ['top', 'middle', 'bottom']
const cells = VERTICALS.flatMap((v) => HORIZONTALS.map((h) => ({ h, v })))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const sub = 'mb-2 mt-4 text-[10px] text-[#9aa9b0]'
const action = `${field} cursor-pointer justify-center hover:bg-[#303a3f] disabled:cursor-not-allowed disabled:opacity-40`
</script>

<template>
  <div v-if="raw && type" :class="section">
    <div :class="label"><h3>Layout</h3></div>

    <template v-if="!isContainer">
      <div :class="sub" class="!mt-0">Gap</div>
      <NumberField :model-value="gap" label="Gap" :min="0" :step="1" unit="px" @focus="hold" @commit="setGap" />
      <div :class="[sub, 'flex items-center justify-between']">
        <span>Items</span>
        <span class="text-[#dce3e7]">{{ stats?.children.length ?? 0 }}</span>
      </div>
      <div class="flex gap-2">
        <button type="button" :class="[action, 'flex-1']" @mousedown.prevent @click="addItem">Add item</button>
        <button type="button" :class="[action, 'flex-1']" :disabled="!stats?.canRemove" @mousedown.prevent @click="removeItem">Remove last item</button>
      </div>
    </template>

    <template v-else-if="container">
      <div :class="[sub, '!mt-0']">Fill</div>
      <ColorField :model-value="container.fillColor" :palette="palette" label="Fill colour" @open="hold" @close="release" @commit="fillColour" />
      <div :class="sub">Fill opacity</div>
      <SliderField :model-value="Math.round(container.fillOpacity * 100)" label="Fill opacity" :min="0" :max="100" unit="%" @focus="hold" @commit="fillOpacity" />

      <div :class="[sub, 'mt-5']">Stroke</div>
      <ColorField :model-value="container.strokeColor" :palette="palette" label="Stroke colour" @open="hold" @close="release" @commit="strokeColour" />
      <div :class="sub">Stroke width</div>
      <NumberField :model-value="container.strokeWidth" label="Stroke width" :min="0" :max="32" :step="0.25" unit="px" @focus="hold" @commit="strokeWidth" />
      <div :class="sub">Stroke opacity</div>
      <SliderField :model-value="Math.round(container.strokeOpacity * 100)" label="Stroke opacity" :min="0" :max="100" unit="%" @focus="hold" @commit="strokeOpacity" />

      <div :class="[sub, 'mt-5']">Corner radius</div>
      <NumberField :model-value="Math.round(container.radius * 10) / 10" label="Corner radius" :min="0" :step="0.5" unit="px" @focus="hold" @commit="setRadius" />

      <div :class="[sub, 'mt-5']">Alignment</div>
      <div role="group" aria-label="Alignment" class="grid grid-cols-3 gap-1">
        <button
          v-for="c in cells"
          :key="`${c.h}-${c.v}`"
          type="button"
          :class="[segment, container.horizontal === c.h && container.vertical === c.v && segmentOn]"
          :aria-label="`${cap(c.h)} ${cap(c.v)}`"
          :aria-pressed="container.horizontal === c.h && container.vertical === c.v"
          :title="`${cap(c.h)} ${cap(c.v)}`"
          @mousedown.prevent="hold"
          @click="align(c.h, c.v)"
        >
          <span class="size-1.5 rounded-full bg-current" aria-hidden="true" />
        </button>
      </div>

      <div :class="[sub, 'mt-5']">Padding X</div>
      <NumberField :model-value="container.paddingX" label="Padding X" :min="0" :step="0.5" unit="px" @focus="hold" @commit="(v) => setPadding('x', v)" />
      <div :class="sub">Padding Y</div>
      <NumberField :model-value="container.paddingY" label="Padding Y" :min="0" :step="0.5" unit="px" @focus="hold" @commit="(v) => setPadding('y', v)" />
    </template>
  </div>
</template>
