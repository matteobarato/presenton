<script setup lang="ts">
import { computed } from 'vue'
import { CopyPlus, Group, Trash2 } from 'lucide-vue-next'
import { deleteSelection, duplicateSelection, groupSelection } from '@/slide-editor/ops'
import { useEditingActions } from '@/slide-editor/useEditingActions'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import { tool } from './toolbarClasses'

const ctx = useSlideEditingContext()
const actions = useEditingActions(ctx)
// Structural tools wait while text is being typed (the keyboard shortcuts are off then too).
const editingText = computed(() => !!ctx.inlineEdit.value)

function run(label: string, op: typeof groupSelection) {
  const ui = ctx.ui.value
  if (ui) void actions.run(label, op(ui, ctx.selection.value))
}
</script>

<template>
  <button type="button" :class="tool" :disabled="editingText" aria-label="Group" title="Group (Ctrl+G)" @mousedown.prevent @click="run('Group', groupSelection)">
    <Group class="size-4" aria-hidden="true" />
  </button>
  <button type="button" :class="tool" :disabled="editingText" aria-label="Duplicate" title="Duplicate (Ctrl+D)" @mousedown.prevent @click="run('Duplicate', duplicateSelection)">
    <CopyPlus class="size-4" aria-hidden="true" />
  </button>
  <button type="button" :class="tool" :disabled="editingText" aria-label="Delete" title="Delete (Del)" @mousedown.prevent @click="run('Delete', deleteSelection)">
    <Trash2 class="size-4" aria-hidden="true" />
  </button>
</template>
