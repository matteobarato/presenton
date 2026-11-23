<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import NumberField from '@/components/editor/inspector/controls/NumberField.vue'
import SliderField from '@/components/editor/inspector/controls/SliderField.vue'
import { label, section, segment, segmentOn } from '@/components/editor/inspector/controls/styles'
import ToggleRow from '@/components/editor/inspector/controls/ToggleRow.vue'
import {
  appearanceTargets,
  patchAppearanceInUi,
  readRotation,
  readTarget,
  setRotationInUi,
  type AppearanceTargets,
} from '@/slide-editor/appearanceTarget'
import {
  DEFAULT_SHADOW,
  readAppearance,
  setFlip,
  setOpacity,
  setShadow,
  type Shadow,
} from '@/slide-editor/elementStyle'
import type { RawElement, RawUi } from '@/slide-editor/model'
import { toolbarKind } from '@/slide-editor/toolbarKind'
import { themePalette } from '@/slide-editor/themePalette'
import { useEditingActions } from '@/slide-editor/useEditingActions'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import { useImageControls } from './useImageControls'

const { t } = useI18n()

const props = defineProps<{ presentation: Presentation }>()

const ctx = useSlideEditingContext()
const actions = useEditingActions(ctx)
const targets = computed(() => (ctx.ui.value ? appearanceTargets(ctx.ui.value, ctx.selection.value) : null))
const rotation = computed(() => (ctx.ui.value && targets.value ? readRotation(ctx.ui.value, targets.value.rotation) : 0))
const appearance = computed(() => {
  const t = targets.value
  const rec = ctx.ui.value && t ? readTarget(ctx.ui.value, t.style) : null
  return rec ? readAppearance(rec as RawElement) : null
})
// Pictures and videos can round their corners; icons are colour masks and cannot.
const { radius, maxRadius, setRadius } = useImageControls()
// Shown as a percentage of the largest radius, so 100% is a circle or pill whatever the size.
const radiusPercent = computed(() => (maxRadius.value > 0 ? Math.round((radius.value / maxRadius.value) * 100) : 0))
const roundable = computed(() => {
  const kind = ctx.ui.value ? toolbarKind(ctx.ui.value, ctx.selection.value) : null
  return kind === 'image' || kind === 'video'
})
const palette = computed(() => themePalette(props.presentation))

// The targets at the moment a colour popover opened or a number field took focus:
// the commit lands there even if the selection moves before it fires.
// Consumed by the commit it was held for; survives selection changes in between (blur commits arrive after the click).
let anchor: AppearanceTargets | null = null
const hold = () => (anchor = targets.value)

function commit(name: string, change: (ui: RawUi, t: AppearanceTargets) => RawUi, deferred = false) {
  const ui = ctx.ui.value
  const t = (deferred ? anchor : null) ?? targets.value
  anchor = null
  // Silently drops the edit when the held target no longer exists (deleted since focus).
  if (!ui || !t || !readTarget(ui, t.rotation) || !readTarget(ui, t.style)) return
  // Built on the live ui: an open inline edit commits its text first rather than reverting this on close.
  void actions.run(name, (live) => {
    if (!readTarget(live, t.rotation) || !readTarget(live, t.style)) return null
    const next = change(live, t)
    return next === live ? null : { ui: next, selection: ctx.selection.value }
  })
}

const rotate = (deg: number, deferred = false) => commit('Rotate', (ui, t) => setRotationInUi(ui, t.rotation, deg), deferred)
const turn = (delta: number) => rotate(rotation.value + delta)
const style = (name: string, fn: (el: RawElement) => RawElement, deferred = false) =>
  commit(name, (ui, t) => patchAppearanceInUi(ui, t.style, fn as (record: Record<string, unknown>) => Record<string, unknown>), deferred)
const flip = (axis: 'h' | 'v') => style('Flip', (el) => setFlip(el, axis))
const opacity = (percent: number) => style('Opacity', (el) => setOpacity(el, percent / 100), true)
const shadowOn = (on: boolean) => style('Shadow', (el) => setShadow(el, on ? { ...DEFAULT_SHADOW } : null))
const shadowPatch = (part: Partial<Shadow>) =>
  style('Shadow', (el) => setShadow(el, { ...readAppearance(el).shadow, ...part }), true)

const sub = 'mb-2 mt-4 text-[10px] text-tx-9aa9b0'
const turnButton = [segment, 'h-[34px] w-[34px] flex-none']
</script>

<template>
  <div v-if="appearance" :class="section">
    <div :class="label"><h3>{{ t('editorInspector.element.appearance.title') }}</h3></div>
    <div :class="[sub, 'mt-0']">{{ t('editorInspector.element.appearance.rotation') }}</div>
    <div class="flex items-center gap-2">
      <NumberField class="min-w-0 flex-1" :model-value="rotation" :label="t('editorInspector.element.appearance.rotation')" unit="°" :step="1" @focus="hold" @commit="rotate($event, true)" />
      <button type="button" :class="turnButton" :aria-label="t('editorInspector.element.appearance.rotateLeft')" :title="t('editorInspector.element.appearance.rotateLeft')" @click="turn(-90)">
        <RotateCcw class="size-4" aria-hidden="true" />
      </button>
      <button type="button" :class="turnButton" :aria-label="t('editorInspector.element.appearance.rotateRight')" :title="t('editorInspector.element.appearance.rotateRight')" @click="turn(90)">
        <RotateCw class="size-4" aria-hidden="true" />
      </button>
    </div>

    <div :class="sub">{{ t('editorInspector.element.appearance.flip') }}</div>
    <div class="flex gap-2">
      <button type="button" :class="[segment, appearance.flipH && segmentOn]" :aria-label="t('editorInspector.element.appearance.flipH')" :title="t('editorInspector.element.appearance.flipHTitle')" :aria-pressed="appearance.flipH" @click="flip('h')">
        <FlipHorizontal2 class="size-4" aria-hidden="true" />
      </button>
      <button type="button" :class="[segment, appearance.flipV && segmentOn]" :aria-label="t('editorInspector.element.appearance.flipV')" :title="t('editorInspector.element.appearance.flipVTitle')" :aria-pressed="appearance.flipV" @click="flip('v')">
        <FlipVertical2 class="size-4" aria-hidden="true" />
      </button>
    </div>

    <div :class="sub">{{ t('editorInspector.element.appearance.opacity') }}</div>
    <SliderField :model-value="Math.round(appearance.opacity * 100)" :label="t('editorInspector.element.appearance.opacity')" :min="0" :max="100" unit="%" @focus="hold" @commit="opacity" />

    <template v-if="roundable">
      <div :class="sub">{{ t('editorInspector.element.appearance.cornerRadius') }}</div>
      <SliderField :model-value="radiusPercent" :label="t('editorInspector.element.appearance.cornerRadius')" :min="0" :max="100" unit="%" @commit="setRadius($event / 100 * maxRadius)" />
    </template>

    <ToggleRow class="mt-5" :model-value="appearance.shadowEnabled" :label="t('editorInspector.element.appearance.shadow')" @update:model-value="shadowOn">
      <ColorField :model-value="appearance.shadow.color" :palette="palette" :label="t('editorInspector.element.appearance.shadowColour')" @open="hold" @commit="(c: string | null) => c && shadowPatch({ color: c })" />
      <div :class="sub">{{ t('editorInspector.element.appearance.blur') }}</div>
      <NumberField :model-value="appearance.shadow.blur" :label="t('editorInspector.element.appearance.blur')" :min="0" :max="100" @focus="hold" @commit="shadowPatch({ blur: $event })" />
      <div class="mt-4 grid grid-cols-2 gap-2">
        <div>
          <div class="mb-2 text-[10px] text-tx-9aa9b0">{{ t('editorInspector.element.appearance.offsetX') }}</div>
          <NumberField :model-value="appearance.shadow.offset_x" :label="t('editorInspector.element.appearance.shadowX')" :min="-100" :max="100" @focus="hold" @commit="shadowPatch({ offset_x: $event })" />
        </div>
        <div>
          <div class="mb-2 text-[10px] text-tx-9aa9b0">{{ t('editorInspector.element.appearance.offsetY') }}</div>
          <NumberField :model-value="appearance.shadow.offset_y" :label="t('editorInspector.element.appearance.shadowY')" :min="-100" :max="100" @focus="hold" @commit="shadowPatch({ offset_y: $event })" />
        </div>
      </div>
      <div :class="sub">{{ t('editorInspector.element.appearance.shadowOpacity') }}</div>
      <SliderField :model-value="Math.round(appearance.shadow.opacity * 100)" :label="t('editorInspector.element.appearance.shadowOpacity')" :min="0" :max="100" unit="%" @focus="hold" @commit="shadowPatch({ opacity: $event / 100 })" />
    </ToggleRow>
  </div>
</template>
