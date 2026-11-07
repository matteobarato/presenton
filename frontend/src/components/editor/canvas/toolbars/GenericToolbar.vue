<script setup lang="ts">
import { computed } from 'vue'
import { Copy, CopyPlus, Trash2, Ungroup } from 'lucide-vue-next'
import { deleteSelection, duplicateSelection, ungroupSelection } from '@/slide-editor/ops'
import { isGroupSelection } from '@/slide-editor/toolbarKind'
import { useClipboard } from '@/slide-editor/useClipboard'
import { useEditingActions } from '@/slide-editor/useEditingActions'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import { tool } from './toolbarClasses'

const ctx = useSlideEditingContext()
const actions = useEditingActions(ctx)
const clipboard = useClipboard()
const isGroup = computed(() => isGroupSelection(ctx.ui.value, ctx.selection.value))

function duplicate() {
  const ui = ctx.ui.value
  if (ui) void actions.run('Duplicate', duplicateSelection(ui, ctx.selection.value))
}
function copy() {
  const ui = ctx.ui.value
  if (ui && ctx.selection.value) void clipboard.copy(ui, ctx.selection.value)
}
function remove() {
  const ui = ctx.ui.value
  if (ui) void actions.run('Delete', deleteSelection(ui, ctx.selection.value))
}
function ungroup() {
  const ui = ctx.ui.value
  if (ui) void actions.run('Ungroup', ungroupSelection(ui, ctx.selection.value))
}
</script>

<template>
  <button v-if="isGroup" type="button" :class="tool" aria-label="Ungroup" title="Ungroup (Shift+Ctrl+G)" @mousedown.prevent @click="ungroup">
    <Ungroup class="size-4" aria-hidden="true" />
  </button>
  <button type="button" :class="tool" aria-label="Duplicate" title="Duplicate (Ctrl+D)" @mousedown.prevent @click="duplicate">
    <CopyPlus class="size-4" aria-hidden="true" />
  </button>
  <button type="button" :class="tool" aria-label="Copy" title="Copy (Ctrl+C)" @mousedown.prevent @click="copy">
    <Copy class="size-4" aria-hidden="true" />
  </button>
  <button type="button" :class="tool" aria-label="Delete" title="Delete (Del)" @mousedown.prevent @click="remove">
    <Trash2 class="size-4" aria-hidden="true" />
  </button>
</template>
