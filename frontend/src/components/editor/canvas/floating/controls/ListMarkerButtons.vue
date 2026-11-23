<script setup lang="ts">
import { List, ListOrdered, ListX } from 'lucide-vue-next'
import { useListMarker } from '@/components/editor/inspector/element/useListMarker'
import { active, tool } from '@/components/editor/canvas/toolbars/toolbarClasses'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Bar controls: the list marker (bullet / number / none).
const { marker, choose } = useListMarker()
const OPTIONS = [
  { value: 'bullet', label: 'editorCanvas.controls.listMarker.bullet', icon: List },
  { value: 'number', label: 'editorCanvas.controls.listMarker.number', icon: ListOrdered },
  { value: 'none', label: 'editorCanvas.controls.listMarker.none', icon: ListX },
] as const
</script>

<template>
  <button
    v-for="o in OPTIONS"
    :key="o.value"
    type="button"
    :class="[tool, marker === o.value && active]"
    :aria-label="t(o.label)"
    :aria-pressed="marker === o.value"
    :title="t(o.label)"
    :data-bar-item="`marker-${o.value}`"
    @mousedown.prevent
    @click="choose(o.value)"
  >
    <component :is="o.icon" class="size-4" aria-hidden="true" />
  </button>
</template>
