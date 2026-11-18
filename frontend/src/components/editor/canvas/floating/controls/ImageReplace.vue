<script setup lang="ts">
import { ref } from 'vue'
import { ImageIcon } from 'lucide-vue-next'
import ImagePickerDialog from '@/components/editor/canvas/ImagePickerDialog.vue'
import { tool } from '@/components/editor/canvas/toolbars/toolbarClasses'
import { useImageControls } from '@/components/editor/inspector/element/useImageControls'

// Bar control: Replace image. Owns the picker dialog, so it stays mounted while the bar is shown.
const { replaceImage } = useImageControls()
const pickerOpen = ref(false)
</script>

<template>
  <button
    type="button"
    :class="tool"
    aria-label="Replace image"
    title="Replace image"
    data-bar-item="replace-image"
    @mousedown.prevent
    @click="pickerOpen = true"
  >
    <ImageIcon class="size-4" aria-hidden="true" />
  </button>
  <ImagePickerDialog v-model:open="pickerOpen" @pick="replaceImage" />
</template>
