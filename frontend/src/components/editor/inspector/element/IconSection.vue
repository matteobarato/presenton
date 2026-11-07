<script setup lang="ts">
import { computed, ref } from 'vue'
import { Shapes } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import { label, section } from '@/components/editor/inspector/controls/styles'
import { toast } from '@/components/ui/sonner'
import { resolveAssetUrl } from '@/render/legacy/lib/template-v2-json-to-html'
import { ICON_WEIGHTS } from '@/api/icons'
import { setIcon, setIconColor, type IconWeight } from '@/slide-editor/elementStyle'
import { getElementAtSelection, type ElementSelection } from '@/slide-editor/model'
import { themePalette } from '@/slide-editor/themePalette'
import { useSelectedElement } from '@/slide-editor/useSelectedElement'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import IconPickerDialog from './IconPickerDialog.vue'

const props = defineProps<{ presentation: Presentation }>()

const ctx = useSlideEditingContext()
const { element, patch, capture } = useSelectedElement(ctx)
const palette = computed(() => themePalette(props.presentation))

const src = computed(() => {
  const data = element.value?.data
  return typeof data === 'string' && data ? resolveAssetUrl(data) : null
})
const color = computed(() => (typeof element.value?.color === 'string' ? element.value.color : null))
const weight = computed<IconWeight>(() => {
  const w = element.value?.icon_type
  return ICON_WEIGHTS.includes(w as IconWeight) ? (w as IconWeight) : 'bold'
})
const currentUrl = computed(() => (typeof element.value?.data === 'string' ? element.value.data : null))

// The target when the colour popover or picker opened: the commit lands there even if the selection moves.
let anchor: ElementSelection | null = null
const hold = () => (anchor = capture())
const pickerOpen = ref(false)
function openPicker() {
  hold()
  pickerOpen.value = true
}

const setColor = (value: string | null) => value && patch('Icon colour', (el) => setIconColor(el, value), anchor ?? undefined)

function onPick(url: string, picked: IconWeight) {
  const at = anchor ?? capture()
  const ui = ctx.ui.value
  if (!at || !ui || !getElementAtSelection(ui, at)) {
    toast.error('The icon was removed from the slide.')
    return
  }
  patch('Change icon', (el) => setIcon(el, url, picked), at)
}
</script>

<template>
  <div v-if="element" :class="section">
    <div :class="label"><h3>Icon</h3></div>
    <div class="mb-3 grid h-20 place-items-center rounded-control border border-white/[0.05] bg-[#11171a]">
      <span
        v-if="src"
        class="size-10"
        data-testid="icon-preview"
        :style="{
          backgroundColor: color ? (color.startsWith('#') ? color : `#${color}`) : '#d0d7dc',
          maskImage: `url(${src})`,
          WebkitMaskImage: `url(${src})`,
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
        }"
      />
    </div>
    <ColorField :model-value="color" :palette="palette" label="Icon colour" @open="hold" @commit="setColor" />
    <button
      type="button"
      class="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-control border border-white/[0.05] bg-field text-[10px] text-[#909fa7] hover:bg-[#303a3f] hover:text-[#d9e6ed]"
      aria-label="Change icon"
      @mousedown.prevent
      @click="openPicker"
    >
      <Shapes class="size-4" aria-hidden="true" />
      Change icon
    </button>
  </div>
  <!-- Outside the v-if: a dialog open while the icon is deleted stays up, and picking then says so. -->
  <IconPickerDialog v-model:open="pickerOpen" :current-url="currentUrl" :weight="weight" @pick="onPick" />
</template>
