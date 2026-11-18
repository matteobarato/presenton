<script setup lang="ts">
import { List, ListOrdered, ListX } from 'lucide-vue-next'
import { useListMarker } from '@/components/editor/inspector/element/useListMarker'
import { active, tool } from '@/components/editor/canvas/toolbars/toolbarClasses'

// Bar controls: the list marker (bullet / number / none).
const { marker, choose } = useListMarker()
const OPTIONS = [
  { value: 'bullet', label: 'Bullet list', icon: List },
  { value: 'number', label: 'Numbered list', icon: ListOrdered },
  { value: 'none', label: 'No marker', icon: ListX },
] as const
</script>

<template>
  <button
    v-for="o in OPTIONS"
    :key="o.value"
    type="button"
    :class="[tool, marker === o.value && active]"
    :aria-label="o.label"
    :aria-pressed="marker === o.value"
    :title="o.label"
    :data-bar-item="`marker-${o.value}`"
    @mousedown.prevent
    @click="choose(o.value)"
  >
    <component :is="o.icon" class="size-4" aria-hidden="true" />
  </button>
</template>
