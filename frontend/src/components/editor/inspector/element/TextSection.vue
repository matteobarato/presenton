<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Palette, Type } from 'lucide-vue-next'
import { field, label, muted, section, segment, segmentOn } from '@/components/editor/inspector/controls/styles'
import { MARKS, useTextControls, type TextControlsProps } from './useTextControls'

const { t } = useI18n()

const props = defineProps<TextControlsProps>()

// The state and actions are shared with the floating bar's quick controls.
const { element, family, size, color, lineHeight, alignment, isOn, families, palette, lineHeights, aligns: ALIGNS, setFamily, setSize, toggle, setColor, setAlign, setLineHeight } =
  useTextControls(props)

function commitSize(event: Event) {
  const input = event.target as HTMLInputElement
  if (!setSize(input.value)) input.value = String(size.value)
}

defineExpose({ families })
</script>

<template>
  <template v-if="element">
    <div :class="section">
      <div :class="label">
        <h3>{{ t('editorInspector.element.text.typography') }}</h3>
        <span :class="muted">{{ family }}</span>
      </div>
      <label :class="field">
        <Type class="size-3.5 shrink-0 text-tx-a0aeb5" aria-hidden="true" />
        <select
          :aria-label="t('editorInspector.element.text.fontFamily')"
          class="h-full w-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-[10px] text-tx-dce3e7 outline-none"
          :value="family"
          @change="setFamily(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="f in families" :key="f" :value="f" class="bg-field">{{ f }}</option>
        </select>
      </label>
      <div class="mt-2 flex gap-2">
        <label :class="[field, 'w-[68px] flex-none']">
          <input
            type="number"
            min="8"
            max="200"
            :aria-label="t('editorInspector.element.text.fontSize')"
            class="h-full w-full min-w-0 bg-transparent text-[10px] text-tx-dce3e7 outline-none"
            :value="size"
            @change="commitSize"
          />
        </label>
        <button
          v-for="m in MARKS"
          :key="m.mark"
          type="button"
          :class="[segment, isOn(m.mark) && segmentOn]"
          :aria-label="m.label"
          :aria-pressed="isOn(m.mark)"
          :title="m.title"
          @mousedown.prevent
          @click="toggle(m.mark)"
        >
          <component :is="m.icon" class="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div :class="section">
      <div :class="label">
        <h3>{{ t('editorInspector.element.text.color') }}</h3>
        <span class="text-[8px] font-normal tracking-[0.03em] text-tx-9caab2">{{ color }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-2.5">
        <button
          v-for="c in palette"
          :key="c"
          type="button"
          class="size-6 rounded-full border-0 outline outline-1 outline-offset-[3px] transition-transform hover:-translate-y-0.5"
          :class="c === color ? 'outline-lx-a9c2ce' : 'outline-transparent'"
          :style="{ background: c }"
          :aria-label="t('editorInspector.element.text.colourValue', { value: c })"
          :aria-pressed="c === color"
          @mousedown.prevent
          @click="setColor(c)"
        />
        <label
          class="relative ml-auto grid size-6 cursor-pointer place-items-center overflow-hidden rounded-full border border-ov/[0.07] bg-sx-30373b text-tx-9daab2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
          :title="t('editorInspector.element.text.customColour')"
        >
          <Palette class="size-3" aria-hidden="true" />
          <input
            type="color"
            :aria-label="t('editorInspector.element.text.customColour')"
            class="absolute inset-0 size-full cursor-pointer opacity-0"
            :value="color"
            @change="setColor(($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </div>

    <div :class="section">
      <div :class="label"><h3>{{ t('editorInspector.element.text.alignment') }}</h3></div>
      <div class="flex gap-2">
        <button
          v-for="a in ALIGNS"
          :key="a.value"
          type="button"
          :class="[segment, alignment === a.value && segmentOn]"
          :aria-label="a.label"
          :aria-pressed="alignment === a.value"
          :title="a.label"
          @mousedown.prevent
          @click="setAlign(a.value)"
        >
          <component :is="a.icon" class="size-4" aria-hidden="true" />
        </button>
      </div>
      <div :class="[label, 'mt-4']">
        <h3>{{ t('editorInspector.element.text.lineHeight') }}</h3>
        <span :class="muted">{{ lineHeight }}</span>
      </div>
      <label :class="field">
        <select
          :aria-label="t('editorInspector.element.text.lineHeight')"
          class="h-full w-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-[10px] text-tx-dce3e7 outline-none"
          :value="String(lineHeight)"
          @change="setLineHeight(Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="h in lineHeights" :key="h" :value="String(h)" class="bg-field">{{ h }}</option>
        </select>
      </label>
    </div>
  </template>
</template>
