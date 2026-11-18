<script setup lang="ts">
import { ListMinus, ListPlus } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { useLayoutControls } from '@/components/editor/inspector/element/useLayoutControls'
import { tool } from '@/components/editor/canvas/toolbars/toolbarClasses'

// Bar controls: add an item to, or remove the last item from, a flex/grid layout.
const props = defineProps<{ presentation: Presentation }>()
const { isContainer, raw, stats, addItem, removeItem } = useLayoutControls(() => props.presentation)
</script>

<template>
  <template v-if="raw && !isContainer">
    <button type="button" :class="tool" aria-label="Add item" title="Add item" data-bar-item="layout-add-item" @mousedown.prevent @click="addItem">
      <ListPlus class="size-4" aria-hidden="true" />
    </button>
    <button
      type="button"
      :class="[tool, 'disabled:cursor-not-allowed disabled:opacity-40']"
      aria-label="Remove last item"
      title="Remove last item"
      :disabled="!stats?.canRemove"
      data-bar-item="layout-remove-item"
      @mousedown.prevent
      @click="removeItem"
    >
      <ListMinus class="size-4" aria-hidden="true" />
    </button>
  </template>
</template>
