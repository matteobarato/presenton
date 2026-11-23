<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref } from 'vue'
import { Crop, ImageIcon, Maximize2, Minimize2 } from 'lucide-vue-next'
import ImagePickerDialog from '@/components/editor/canvas/ImagePickerDialog.vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { resolveAssetUrl } from '@/render/legacy/lib/template-v2-json-to-html'
import { useImageControls } from './useImageControls'

const { t } = useI18n()

const pickerOpen = ref(false)
const focusOpen = ref(false)

const { element, fit, isIcon, focusX, focusY, replaceImage: onPick, setFit, setFocus: applyFocus } = useImageControls()

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
  { value: 'cover', icon: Maximize2 },
  { value: 'contain', icon: Minimize2 },
] as const
const fitName = (value: string) => t(`editorInspector.element.image.fit.${value}`)
const POSITIONS = [0, 50, 100]
const FOCUS_KEYS = [
  ['topLeft', 'top', 'topRight'],
  ['left', 'center', 'right'],
  ['bottomLeft', 'bottom', 'bottomRight'],
] as const
const focusName = (row: number, col: number) => t(`editorInspector.element.image.focus.${FOCUS_KEYS[row]![col]}`)

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
      <div :class="label"><h3>{{ t('editorInspector.element.image.title') }}</h3></div>
      <button
        v-if="previewSrc"
        type="button"
        class="group relative mb-2 block aspect-video w-full overflow-hidden rounded-control border border-ov/[0.05] bg-sx-11171a"
        :aria-label="t('editorInspector.element.image.previewAria')"
        :title="t('editorInspector.element.image.replace')"
        data-testid="image-preview"
        @mousedown.prevent
        @click="pickerOpen = true"
      >
        <img :src="previewSrc" alt="" class="size-full" :style="previewStyle" draggable="false" />
        <span class="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/25" aria-hidden="true" />
      </button>
      <button type="button" :class="segment" class="w-full flex-none" :aria-label="t('editorInspector.element.image.replace')" @mousedown.prevent @click="pickerOpen = true">
        <ImageIcon class="size-4" aria-hidden="true" />
        {{ t('editorInspector.element.image.replaceButton') }}
      </button>
    </div>

    <div :class="section">
      <div :class="label">
        <h3>{{ t('editorInspector.element.image.fitTitle') }}</h3>
        <span :class="muted">{{ fitName(fit) }}</span>
      </div>
      <div class="flex gap-2">
        <button
          v-for="f in FITS"
          :key="f.value"
          type="button"
          :class="[segment, fit === f.value && segmentOn]"
          :aria-label="fitName(f.value)"
          :aria-pressed="fit === f.value"
          @mousedown.prevent
          @click="setFit(f.value)"
        >
          <component :is="f.icon" class="size-4" aria-hidden="true" />
          {{ fitName(f.value) }}
        </button>
      </div>
      <div :class="[label, 'mt-4']">
        <h3>{{ t('editorInspector.element.image.focusTitle') }}</h3>
        <span :class="muted">{{ focusX }}%, {{ focusY }}%</span>
      </div>
      <Popover v-model:open="focusOpen">
        <PopoverTrigger as-child>
          <button type="button" :class="[segment, 'w-full flex-none']" :aria-label="t('editorInspector.element.image.focusTitle')">
            <Crop class="size-4" aria-hidden="true" />
            {{ t('editorInspector.element.image.adjustFocus') }}
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
                :aria-label="t('editorInspector.element.image.focusAria', { position: focusName(row, col) })"
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
