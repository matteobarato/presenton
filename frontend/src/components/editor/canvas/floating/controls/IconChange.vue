<script setup lang="ts">
import { Shapes } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { tool } from '@/components/editor/canvas/toolbars/toolbarClasses'
import IconPickerDialog from '@/components/editor/inspector/element/IconPickerDialog.vue'
import { useIconControls } from '@/components/editor/inspector/element/useIconControls'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Bar control: Change icon. Owns the picker dialog, so it stays mounted while the bar is shown.
const props = defineProps<{ presentation: Presentation }>()
const { currentUrl, weight, pickerOpen, openPicker, onPick } = useIconControls(() => props.presentation)
</script>

<template>
  <button
    type="button"
    :class="tool"
    :aria-label="t('editorCanvas.controls.iconChange')"
    :title="t('editorCanvas.controls.iconChange')"
    data-bar-item="change-icon"
    @mousedown.prevent
    @click="openPicker"
  >
    <Shapes class="size-4" aria-hidden="true" />
  </button>
  <IconPickerDialog v-model:open="pickerOpen" :current-url="currentUrl" :weight="weight" @pick="onPick" />
</template>
