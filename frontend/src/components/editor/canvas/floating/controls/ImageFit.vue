<script setup lang="ts">
import { Maximize2, Minimize2 } from 'lucide-vue-next'
import { active, tool } from '@/components/editor/canvas/toolbars/toolbarClasses'
import { useImageControls } from '@/components/editor/inspector/element/useImageControls'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Bar controls: how the picture fills its frame (cover crops around the focus point, contain shows all of it).
const { fit, setFit } = useImageControls()
const FITS = [
  { value: 'cover', label: 'editorCanvas.controls.imageFit.cover', icon: Maximize2 },
  { value: 'contain', label: 'editorCanvas.controls.imageFit.contain', icon: Minimize2 },
] as const
</script>

<template>
  <button
    v-for="f in FITS"
    :key="f.value"
    type="button"
    :class="[tool, fit === f.value && active]"
    :aria-label="t(f.label)"
    :aria-pressed="fit === f.value"
    :title="t('editorCanvas.controls.imageFit.title', { fit: t(f.label) })"
    :data-bar-item="`fit-${f.value}`"
    @mousedown.prevent
    @click="setFit(f.value)"
  >
    <component :is="f.icon" class="size-4" aria-hidden="true" />
  </button>
</template>
