<script setup lang="ts">
import type { Presentation } from '@/api/types'
import { useTableControls } from '@/components/editor/inspector/element/useTableControls'
import { tool } from '@/components/editor/canvas/toolbars/toolbarClasses'

// Bar controls: add/delete row and column (the cell picked on the slide decides which row/column; the Table panel has the rest).
const props = defineProps<{ presentation: Presentation }>()
const { structure } = useTableControls(() => props.presentation)
const QUICK = ['add-row', 'add-column', 'delete-row', 'delete-column']
</script>

<template>
  <template v-for="s in structure" :key="s.id">
    <button
      v-if="QUICK.includes(s.id)"
      type="button"
      :class="[tool, 'disabled:cursor-not-allowed disabled:opacity-40']"
      :aria-label="s.label"
      :title="s.ok ? s.label : s.why"
      :disabled="!s.ok"
      :data-bar-item="s.id"
      @mousedown.prevent
      @click="s.run()"
    >
      <component :is="s.icon" class="size-3.5" aria-hidden="true" />
    </button>
  </template>
</template>
