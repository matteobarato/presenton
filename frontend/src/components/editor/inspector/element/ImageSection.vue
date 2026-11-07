<script setup lang="ts">
import { computed, ref } from 'vue'
import { Crop, ImageIcon, Maximize2, Minimize2 } from 'lucide-vue-next'
import ImagePickerDialog from '@/components/editor/canvas/ImagePickerDialog.vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getElementAtSelection, updateElementInUi, type ElementSelection, type RawElement } from '@/slide-editor/model'
import { useEditingActions } from '@/slide-editor/useEditingActions'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

const ctx = useSlideEditingContext()
const actions = useEditingActions(ctx)
const pickerOpen = ref(false)
const focusOpen = ref(false)

/** The image element edited: the selected element, or the lone element of a selected component. */
const target = computed<ElementSelection | null>(() => {
  const sel = ctx.selection.value
  if (!sel || sel.kind === 'multi-component') return null
  return sel.kind === 'element' ? sel : { kind: 'element', componentIndex: sel.componentIndex, elementPath: [0] }
})
const element = computed<RawElement | null>(() => {
  const ui = ctx.ui.value
  return ui && target.value ? getElementAtSelection(ui, target.value) : null
})

const clamp = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 50)
// As the renderer reads it: cover, fill, else contain. A fill image has neither button pressed.
const fit = computed<'cover' | 'contain' | 'fill'>(() => {
  const raw = element.value?.fit
  return raw === 'cover' || raw === 'fill' ? raw : 'contain'
})
const FIT_NAMES = { cover: 'Cover', contain: 'Contain', fill: 'Fill' } as const
// An icon renders as a colour mask of its picture: a photo would show as a silhouette.
const isIcon = computed(() => !!(element.value?.isIcon ?? element.value?.is_icon))
const focusX = computed(() => clamp(element.value?.focus_x))
const focusY = computed(() => clamp(element.value?.focus_y))

const FITS = [
  { value: 'cover', label: 'Cover', icon: Maximize2 },
  { value: 'contain', label: 'Contain', icon: Minimize2 },
] as const
const POSITIONS = [0, 50, 100]
const NAMES = ['top', 'center', 'bottom']
const NAMES_X = ['left', 'center', 'right']
const focusName = (row: number, col: number) => (row === 1 && col === 1 ? 'center' : `${NAMES[row]} ${NAMES_X[col]}`.replace('center ', '').replace(' center', ''))

function patch(label: string, change: Record<string, unknown>) {
  const ui = ctx.ui.value
  const sel = target.value
  if (!ui || !sel) return
  const next = updateElementInUi(ui, sel, (el) => ({ ...el, ...change }))
  void actions.run(label, { ui: next, selection: ctx.selection.value } as never)
}
function onPick(src: string) {
  // A new picture starts centred and uncropped, as in the old editor.
  patch('Replace image', { data: src, focus_x: 50, focus_y: 50, crop_scale: null })
}
function setFit(value: 'cover' | 'contain') {
  if (value !== fit.value) patch('Image fit', { fit: value })
}
function setFocus(x: number, y: number) {
  patch('Crop focus', { focus_x: x, focus_y: y })
  focusOpen.value = false
}

const section = 'border-t border-line py-[18px] min-[1600px]:py-[22px]'
const label = 'mb-3 flex items-center justify-between text-[10px] font-medium text-[#d0d7dc] min-[1600px]:text-[11px]'
const muted = 'truncate pl-2 text-[9px] font-normal text-[#9aa9b0]'
const segment =
  'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-control border border-white/[0.05] bg-field text-[10px] text-[#909fa7] hover:bg-[#303a3f] hover:text-[#d9e6ed]'
const segmentOn = '!border-accent/50 !bg-[#303c42] !text-[#c4e4f4]'
</script>

<template>
  <template v-if="element">
    <div v-if="!isIcon" :class="section">
      <div :class="label"><h3>Image</h3></div>
      <button type="button" :class="segment" class="w-full flex-none" aria-label="Replace image" @mousedown.prevent @click="pickerOpen = true">
        <ImageIcon class="size-4" aria-hidden="true" />
        Replace
      </button>
    </div>

    <div :class="section">
      <div :class="label">
        <h3>Fit</h3>
        <span :class="muted">{{ FIT_NAMES[fit] }}</span>
      </div>
      <div class="flex gap-2">
        <button
          v-for="f in FITS"
          :key="f.value"
          type="button"
          :class="[segment, fit === f.value && segmentOn]"
          :aria-label="f.label"
          :aria-pressed="fit === f.value"
          @mousedown.prevent
          @click="setFit(f.value)"
        >
          <component :is="f.icon" class="size-4" aria-hidden="true" />
          {{ f.label }}
        </button>
      </div>
      <div :class="[label, 'mt-4']">
        <h3>Crop focus</h3>
        <span :class="muted">{{ focusX }}%, {{ focusY }}%</span>
      </div>
      <Popover v-model:open="focusOpen">
        <PopoverTrigger as-child>
          <button type="button" :class="[segment, 'w-full flex-none']" aria-label="Crop focus">
            <Crop class="size-4" aria-hidden="true" />
            Adjust focus
          </button>
        </PopoverTrigger>
        <PopoverContent class="w-auto p-3" data-inline-edit-ignore="true">
          <div class="grid grid-cols-3 gap-1.5">
            <template v-for="(y, row) in POSITIONS" :key="y">
              <button
                v-for="(x, col) in POSITIONS"
                :key="`${x}-${y}`"
                type="button"
                :class="[segment, 'size-9 flex-none', focusX === x && focusY === y && segmentOn]"
                :aria-label="`Focus ${focusName(row, col)}`"
                :aria-pressed="focusX === x && focusY === y"
                @click="setFocus(x, y)"
              >
                <span class="size-1.5 rounded-full bg-current" aria-hidden="true" />
              </button>
            </template>
          </div>
        </PopoverContent>
      </Popover>
    </div>

    <ImagePickerDialog v-if="!isIcon" v-model:open="pickerOpen" @pick="onPick" />
  </template>
</template>
