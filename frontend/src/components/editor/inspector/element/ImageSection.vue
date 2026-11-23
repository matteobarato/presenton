<script setup lang="ts">
import { computed, ref } from 'vue'
import { Crop, ImageIcon, Maximize2, Minimize2 } from 'lucide-vue-next'
import ImagePickerDialog from '@/components/editor/canvas/ImagePickerDialog.vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { resolveAssetUrl } from '@/render/legacy/lib/template-v2-json-to-html'
import { useImageControls } from './useImageControls'

const pickerOpen = ref(false)
const focusOpen = ref(false)

const { element, fit, isIcon, focusX, focusY, replaceImage: onPick, setFit, setFocus: applyFocus } = useImageControls()

const FIT_NAMES = { cover: 'Cover', contain: 'Contain', fill: 'Fill' } as const
const previewSrc = computed(() => {
  const data = element.value?.data
  return typeof data === 'string' && data ? resolveAssetUrl(data) : null
})
// The preview shows the crop as the slide does: cover crops around the focus point.
const previewStyle = computed(() => ({
  objectFit: fit.value,
  objectPosition: `${focusX.value}% ${focusY.value}%`,
}))

const FITS = [
  { value: 'cover', label: 'Cover', icon: Maximize2 },
  { value: 'contain', label: 'Contain', icon: Minimize2 },
] as const
const POSITIONS = [0, 50, 100]
const NAMES = ['top', 'center', 'bottom']
const NAMES_X = ['left', 'center', 'right']
const focusName = (row: number, col: number) => (row === 1 && col === 1 ? 'center' : `${NAMES[row]} ${NAMES_X[col]}`.replace('center ', '').replace(' center', ''))

function setFocus(x: number, y: number) {
  applyFocus(x, y)
  focusOpen.value = false
}

const section = 'border-t border-line py-[18px] min-[1600px]:py-[22px]'
const label = 'mb-3 flex items-center justify-between text-[10px] font-medium text-tx-d0d7dc min-[1600px]:text-[11px]'
const muted = 'truncate pl-2 text-[9px] font-normal text-tx-9aa9b0'
const segment =
  'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-control border border-ov/[0.05] bg-field text-[10px] text-tx-909fa7 hover:bg-sx-303a3f hover:text-tx-d9e6ed'
const segmentOn = '!border-accent/50 !bg-sx-303c42 !text-tx-c4e4f4'
</script>

<template>
  <template v-if="element">
    <div v-if="!isIcon" :class="section">
      <div :class="label"><h3>Image</h3></div>
      <button
        v-if="previewSrc"
        type="button"
        class="group relative mb-2 block aspect-video w-full overflow-hidden rounded-control border border-ov/[0.05] bg-sx-11171a"
        aria-label="Image preview, click to replace"
        title="Replace image"
        data-testid="image-preview"
        @mousedown.prevent
        @click="pickerOpen = true"
      >
        <img :src="previewSrc" alt="" class="size-full" :style="previewStyle" draggable="false" />
        <span class="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/25" aria-hidden="true" />
      </button>
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
