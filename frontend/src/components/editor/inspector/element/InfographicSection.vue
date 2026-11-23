<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref } from 'vue'
import type { Presentation } from '@/api/types'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import NumberField from '@/components/editor/inspector/controls/NumberField.vue'
import { field, label, section } from '@/components/editor/inspector/controls/styles'
import {
  addItem,
  itemStats,
  readColors,
  readMeter,
  readTextColor,
  removeLastItem,
  setColor,
  setMeter,
  setTextColor,
  type Meter,
} from '@/slide-editor/infographicOps'
import { getElementAtSelection, updateElementInUi, type ElementSelection, type RawElement } from '@/slide-editor/model'
import { themePalette } from '@/slide-editor/themePalette'
import { useEditingActions } from '@/slide-editor/useEditingActions'

import InfographicItemsDialog from './InfographicItemsDialog.vue'
import { useInfographicControls } from './useInfographicControls'

const { t } = useI18n()

const props = defineProps<{ presentation: Presentation }>()

const { ctx, root, raw, group } = useInfographicControls()
const actions = useEditingActions(ctx)
const palette = computed(() => themePalette(props.presentation))
const meter = computed(() => (raw.value ? readMeter(raw.value) : null))
const colours = computed(() => (raw.value ? readColors(raw.value) : []))
const textColour = computed(() => (raw.value ? readTextColor(raw.value) : null))
const stats = computed(() => (raw.value ? itemStats(raw.value) : null))

/** Whether the items dialog is open. */
const itemsOpen = ref(false)
defineExpose({ itemsOpen })

// Anchor: the infographic root when a colour popover opened or a number field took focus, so a deferred commit
// lands there. A number field commits on blur, after a canvas click has already moved the selection
// (see AppearanceSection.vue).
let anchor: ElementSelection | null = null
const hold = () => (anchor = root.value)
function target(): ElementSelection | null {
  const at = anchor ?? root.value
  anchor = null
  return at
}

/** Commit `build(el)` as one undo step; a null result (or the same element) commits nothing. */
function edit(name: string, build: (el: RawElement) => RawElement | null, at: ElementSelection | null = root.value) {
  if (!at) return
  void actions.run(name, (ui) => {
    const current = getElementAtSelection(ui, at)
    const next = current ? build(current) : null
    return current && next && next !== current ? { ui: updateElementInUi(ui, at, () => next), selection: ctx.selection.value } : null
  })
}

// An unchanged or rejected patch commits nothing, and NumberField re-shows the stored value itself.
function setMeterField(key: keyof Meter, name: string, value: number) {
  const at = target()
  edit(name, (el) => {
    const next = setMeter(el, { [key]: value })
    if (!next) return null
    const before = readMeter(el)
    const after = readMeter(next)
    return before.value === after.value && before.min === after.min && before.max === after.max && !('infographic_type' in el) ? null : next
  }, at)
}

const colour = (index: number, value: string | null) => value && edit('Infographic colour', (el) => setColor(el, index, value), target())
const textColourCommit = (value: string | null) => value && edit('Text colour', (el) => setTextColor(el, value), target())
const add = () => edit('Add item', addItem)
const remove = () => edit('Remove item', removeLastItem)

const sub = 'mb-2 mt-4 text-[10px] text-tx-9aa9b0'
const action = `${field} cursor-pointer justify-center hover:bg-sx-303a3f disabled:cursor-not-allowed disabled:opacity-40`
</script>

<template>
  <div v-if="raw && group" :class="section">
    <div :class="label"><h3>{{ t('editorInspector.element.infographic.title') }}</h3></div>

    <template v-if="group === 'meter' && meter">
      <div :class="[sub, '!mt-0']">{{ t('editorInspector.element.infographic.value') }}</div>
      <NumberField :model-value="meter.value" :label="t('editorInspector.element.infographic.value')" :step="1" @focus="hold" @commit="(v) => setMeterField('value', 'Infographic value', v)" />
      <div :class="sub">{{ t('editorInspector.element.infographic.min') }}</div>
      <NumberField :model-value="meter.min" :label="t('editorInspector.element.infographic.min')" :step="1" @focus="hold" @commit="(v) => setMeterField('min', 'Infographic range', v)" />
      <div :class="sub">{{ t('editorInspector.element.infographic.max') }}</div>
      <NumberField :model-value="meter.max" :label="t('editorInspector.element.infographic.max')" :step="1" @focus="hold" @commit="(v) => setMeterField('max', 'Infographic range', v)" />
    </template>

    <template v-if="group === 'items' && stats">
      <div :class="[sub, 'flex items-center justify-between', '!mt-0']">
        <span>{{ t('editorInspector.element.infographic.items') }}</span>
        <span class="text-tx-dce3e7">{{ stats.count }}</span>
      </div>
      <div class="flex gap-2">
        <button type="button" :class="[action, 'flex-1']" :disabled="!stats.canAdd" @mousedown.prevent @click="add">{{ t('editorInspector.element.infographic.addItem') }}</button>
        <button type="button" :class="[action, 'flex-1']" :disabled="!stats.canRemove" @mousedown.prevent @click="remove">{{ t('editorInspector.element.infographic.removeItem') }}</button>
      </div>
      <button type="button" :class="[action, 'mt-2 w-full']" @mousedown.prevent @click="itemsOpen = true">{{ t('editorInspector.element.infographic.editItems') }}</button>
    </template>

    <div :class="[sub, group === 'other' && '!mt-0']">{{ t('editorInspector.element.infographic.colours') }}</div>
    <div class="flex flex-col gap-2">
      <ColorField
        v-for="(c, i) in colours"
        :key="i"
        :model-value="c"
        :palette="palette"
        :label="t('editorInspector.element.infographic.colourN', { n: i + 1 })"
        @open="hold"
        @close="anchor = null"
        @commit="(v) => colour(i, v)"
      />
    </div>
    <div :class="sub">{{ t('editorInspector.element.infographic.textColour') }}</div>
    <ColorField :model-value="textColour ?? colours[0] ?? null" :palette="palette" :label="t('editorInspector.element.infographic.textColour')" @open="hold" @close="anchor = null" @commit="textColourCommit" />
  </div>

  <InfographicItemsDialog v-if="root && group === 'items'" v-model:open="itemsOpen" :root="root" />
</template>
