<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Presentation } from '@/api/types'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import NumberField from '@/components/editor/inspector/controls/NumberField.vue'
import SliderField from '@/components/editor/inspector/controls/SliderField.vue'
import { field, label, section, segment, segmentOn } from '@/components/editor/inspector/controls/styles'
import type { Horizontal, Vertical } from '@/slide-editor/layoutOps'
import { useLayoutControls } from './useLayoutControls'

const { t } = useI18n()

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
const alignLabel = (h: Horizontal, v: Vertical) => t('editorInspector.element.layout.alignCell', { h: t(`editorInspector.element.layout.align.${h}`), v: t(`editorInspector.element.layout.align.${v}`) })
const sub = 'mb-2 mt-4 text-[10px] text-tx-9aa9b0'
const action = `${field} cursor-pointer justify-center hover:bg-sx-303a3f disabled:cursor-not-allowed disabled:opacity-40`
</script>

<template>
  <div v-if="raw && type" :class="section">
    <div :class="label"><h3>{{ t('editorInspector.element.layout.title') }}</h3></div>

    <template v-if="!isContainer">
      <div :class="sub" class="!mt-0">{{ t('editorInspector.element.layout.gap') }}</div>
      <NumberField :model-value="gap" :label="t('editorInspector.element.layout.gap')" :min="0" :step="1" unit="px" @focus="hold" @commit="setGap" />
      <div :class="[sub, 'flex items-center justify-between']">
        <span>{{ t('editorInspector.element.layout.items') }}</span>
        <span class="text-tx-dce3e7">{{ stats?.children.length ?? 0 }}</span>
      </div>
      <div class="flex gap-2">
        <button type="button" :class="[action, 'flex-1']" @mousedown.prevent @click="addItem">{{ t('editorInspector.element.layout.addItem') }}</button>
        <button type="button" :class="[action, 'flex-1']" :disabled="!stats?.canRemove" @mousedown.prevent @click="removeItem">{{ t('editorInspector.element.layout.removeItem') }}</button>
      </div>
    </template>

    <template v-else-if="container">
      <div :class="[sub, '!mt-0']">{{ t('editorInspector.element.layout.fill') }}</div>
      <ColorField :model-value="container.fillColor" :palette="palette" :label="t('editorInspector.element.layout.fillColour')" @open="hold" @close="release" @commit="fillColour" />
      <div :class="sub">{{ t('editorInspector.element.layout.fillOpacity') }}</div>
      <SliderField :model-value="Math.round(container.fillOpacity * 100)" :label="t('editorInspector.element.layout.fillOpacity')" :min="0" :max="100" unit="%" @focus="hold" @commit="fillOpacity" />

      <div :class="[sub, 'mt-5']">{{ t('editorInspector.element.layout.stroke') }}</div>
      <ColorField :model-value="container.strokeColor" :palette="palette" :label="t('editorInspector.element.layout.strokeColour')" @open="hold" @close="release" @commit="strokeColour" />
      <div :class="sub">{{ t('editorInspector.element.layout.strokeWidth') }}</div>
      <NumberField :model-value="container.strokeWidth" :label="t('editorInspector.element.layout.strokeWidth')" :min="0" :max="32" :step="0.25" unit="px" @focus="hold" @commit="strokeWidth" />
      <div :class="sub">{{ t('editorInspector.element.layout.strokeOpacity') }}</div>
      <SliderField :model-value="Math.round(container.strokeOpacity * 100)" :label="t('editorInspector.element.layout.strokeOpacity')" :min="0" :max="100" unit="%" @focus="hold" @commit="strokeOpacity" />

      <div :class="[sub, 'mt-5']">{{ t('editorInspector.element.layout.cornerRadius') }}</div>
      <NumberField :model-value="Math.round(container.radius * 10) / 10" :label="t('editorInspector.element.layout.cornerRadius')" :min="0" :step="0.5" unit="px" @focus="hold" @commit="setRadius" />

      <div :class="[sub, 'mt-5']">{{ t('editorInspector.element.layout.alignment') }}</div>
      <div role="group" :aria-label="t('editorInspector.element.layout.alignment')" class="grid grid-cols-3 gap-1">
        <button
          v-for="c in cells"
          :key="`${c.h}-${c.v}`"
          type="button"
          :class="[segment, container.horizontal === c.h && container.vertical === c.v && segmentOn]"
          :aria-label="alignLabel(c.h, c.v)"
          :aria-pressed="container.horizontal === c.h && container.vertical === c.v"
          :title="alignLabel(c.h, c.v)"
          @mousedown.prevent="hold"
          @click="align(c.h, c.v)"
        >
          <span class="size-1.5 rounded-full bg-current" aria-hidden="true" />
        </button>
      </div>

      <div :class="[sub, 'mt-5']">{{ t('editorInspector.element.layout.paddingX') }}</div>
      <NumberField :model-value="container.paddingX" :label="t('editorInspector.element.layout.paddingX')" :min="0" :step="0.5" unit="px" @focus="hold" @commit="(v) => setPadding('x', v)" />
      <div :class="sub">{{ t('editorInspector.element.layout.paddingY') }}</div>
      <NumberField :model-value="container.paddingY" :label="t('editorInspector.element.layout.paddingY')" :min="0" :step="0.5" unit="px" @focus="hold" @commit="(v) => setPadding('y', v)" />
    </template>
  </div>
</template>
