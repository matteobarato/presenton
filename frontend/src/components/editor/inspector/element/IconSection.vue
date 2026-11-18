<script setup lang="ts">
import { Shapes } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import { label, section } from '@/components/editor/inspector/controls/styles'
import IconPickerDialog from './IconPickerDialog.vue'
import { useIconControls } from './useIconControls'

const props = defineProps<{ presentation: Presentation }>()

const { element, palette, src, color, weight, currentUrl, hold, setColor, pickerOpen, openPicker, onPick } = useIconControls(() => props.presentation)
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
