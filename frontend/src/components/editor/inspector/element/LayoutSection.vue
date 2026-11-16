<script setup lang="ts">
import { computed } from 'vue'
import type { Presentation } from '@/api/types'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import NumberField from '@/components/editor/inspector/controls/NumberField.vue'
import SliderField from '@/components/editor/inspector/controls/SliderField.vue'
import { field, label, section, segment, segmentOn } from '@/components/editor/inspector/controls/styles'
import { dataRoot } from '@/slide-editor/dataRoot'
import {
  addLayoutItem,
  alignmentChanges,
  applyLayoutChanges,
  fillChanges,
  gapChanges,
  layoutType,
  paddingChanges,
  radiusChanges,
  readContainer,
  readGap,
  removeLastLayoutItem,
  strokeChanges,
  type Horizontal,
  type Vertical,
} from '@/slide-editor/layoutOps'
import {
  absoluteBoxForSelection,
  getElementAtSelection,
  layoutItemStats,
  type ElementSelection,
  type RawElement,
  type RawUi,
} from '@/slide-editor/model'
import { themePalette } from '@/slide-editor/themePalette'
import { useEditingActions } from '@/slide-editor/useEditingActions'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

const props = defineProps<{ presentation: Presentation }>()

const ctx = useSlideEditingContext()
const actions = useEditingActions(ctx)
const palette = computed(() => themePalette(props.presentation))

/** The layout (it can sit inside a selected component). */
const root = computed<ElementSelection | null>(() => dataRoot(ctx.ui.value, ctx.selection.value, 'layout'))
const raw = computed<RawElement | null>(() => (ctx.ui.value && root.value ? getElementAtSelection(ctx.ui.value, root.value) : null))
const type = computed(() => layoutType(raw.value))
const isContainer = computed(() => type.value === 'container')
const gap = computed(() => (raw.value ? readGap(raw.value) : 0))
const stats = computed(() => (raw.value ? layoutItemStats(raw.value) : null))
const box = computed(() => (ctx.ui.value && root.value ? absoluteBoxForSelection(ctx.ui.value, root.value) : null))
const container = computed(() => (raw.value && isContainer.value ? readContainer(raw.value, box.value ?? { width: 0, height: 0 }) : null))

// Anchor: the layout root when a colour popover opened, a field took focus or an alignment button was pressed,
// so a deferred commit lands there. A number field commits on blur, after a canvas click has already moved the
// selection (see AppearanceSection.vue).
let anchor: ElementSelection | null = null
const hold = () => (anchor = root.value)
function target(): ElementSelection | null {
  const at = anchor ?? root.value
  anchor = null
  return at
}

function run(name: string, fn: (ui: RawUi, at: ElementSelection) => RawUi | null, at: ElementSelection | null = root.value) {
  if (!at) return
  void actions.run(name, (ui) => {
    const next = fn(ui, at)
    return next ? { ui: next, selection: ctx.selection.value } : null
  })
}
function change(name: string, build: (el: RawElement, ui: RawUi, at: ElementSelection) => Record<string, unknown>, at: ElementSelection | null) {
  run(name, (ui, r) => {
    const el = getElementAtSelection(ui, r)
    return el ? applyLayoutChanges(ui, r, build(el, ui, r)) : null
  }, at)
}
/** The corner radius cap of the container at `at` (the anchored one, not the current selection). */
function maxRadiusAt(el: RawElement, ui: RawUi, at: ElementSelection): number {
  return readContainer(el, absoluteBoxForSelection(ui, at) ?? { width: 0, height: 0 }).maxRadius
}

const setGap = (v: number) => {
  const at = target()
  if (Number.isFinite(v)) change('Gap', () => gapChanges(v), at)
}
const addItem = () => run('Add item', addLayoutItem)
const removeItem = () => run('Remove item', removeLastLayoutItem)
const fillColour = (c: string | null) => c && change('Fill', (el) => fillChanges(el, { color: c }), target())
const fillOpacity = (p: number) => change('Fill', (el) => fillChanges(el, { opacity: p / 100 }), target())
const strokeColour = (c: string | null) => c && change('Stroke', (el) => strokeChanges(el, { color: c }), target())
const strokeWidth = (w: number) => change('Stroke', (el) => strokeChanges(el, { width: w }), target())
const strokeOpacity = (p: number) => change('Stroke', (el) => strokeChanges(el, { opacity: p / 100 }), target())
const setRadius = (v: number) => change('Corner radius', (el, ui, at) => radiusChanges(v, maxRadiusAt(el, ui, at)), target())
const align = (h: Horizontal, v: Vertical) => change('Alignment', (el) => alignmentChanges(el, h, v), target())
const setPadding = (axis: 'x' | 'y', v: number) => change('Padding', (el) => paddingChanges(el, axis, v), target())

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
      <ColorField :model-value="container.fillColor" :palette="palette" label="Fill colour" @open="hold" @close="anchor = null" @commit="fillColour" />
      <div :class="sub">Fill opacity</div>
      <SliderField :model-value="Math.round(container.fillOpacity * 100)" label="Fill opacity" :min="0" :max="100" unit="%" @focus="hold" @commit="fillOpacity" />

      <div :class="[sub, 'mt-5']">Stroke</div>
      <ColorField :model-value="container.strokeColor" :palette="palette" label="Stroke colour" @open="hold" @close="anchor = null" @commit="strokeColour" />
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
