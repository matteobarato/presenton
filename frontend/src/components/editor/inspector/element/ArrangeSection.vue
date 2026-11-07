<script setup lang="ts">
import { computed } from 'vue'
import { Copy, CopyPlus, Group, Trash2, Ungroup } from 'lucide-vue-next'
import { deleteSelection, duplicateSelection, groupSelection, ungroupSelection } from '@/slide-editor/ops'
import { isGroupSelection, toolbarKind } from '@/slide-editor/toolbarKind'
import { useClipboard } from '@/slide-editor/useClipboard'
import { useEditingActions } from '@/slide-editor/useEditingActions'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

const ctx = useSlideEditingContext()
const actions = useEditingActions(ctx)
const clipboard = useClipboard()
const isGroup = computed(() => isGroupSelection(ctx.ui.value, ctx.selection.value))
const isMulti = computed(() => toolbarKind(ctx.ui.value, ctx.selection.value) === 'multi')
// Structural tools wait while text is being typed (the keyboard shortcuts are off then too).
const editingText = computed(() => !!ctx.inlineEdit.value)

const button =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-control border border-white/[0.06] bg-field px-2 text-[10px] font-normal text-[#c6ced3] hover:bg-[#303a3f] hover:text-white disabled:opacity-35 disabled:hover:bg-field'

function run(label: string, op: typeof groupSelection) {
  const ui = ctx.ui.value
  if (ui) void actions.run(label, op(ui, ctx.selection.value))
}
function copy() {
  const ui = ctx.ui.value
  if (ui && ctx.selection.value) void clipboard.copy(ui, ctx.selection.value)
}
</script>

<template>
  <div class="border-t border-line py-[18px] min-[1600px]:py-[22px]">
    <div class="mb-3 flex items-center justify-between text-[10px] font-medium text-[#d0d7dc] min-[1600px]:text-[11px]">
      <h3>Arrange</h3>
    </div>
    <div class="grid grid-cols-3 gap-2">
      <button v-if="isMulti" type="button" :class="button" :disabled="editingText" aria-label="Group" title="Group (Ctrl+G)" @mousedown.prevent @click="run('Group', groupSelection)">
        <Group class="size-3.5" aria-hidden="true" />Group
      </button>
      <button v-if="isGroup" type="button" :class="button" :disabled="editingText" aria-label="Ungroup" title="Ungroup (Shift+Ctrl+G)" @mousedown.prevent @click="run('Ungroup', ungroupSelection)">
        <Ungroup class="size-3.5" aria-hidden="true" />Ungroup
      </button>
      <button type="button" :class="button" :disabled="editingText" aria-label="Duplicate" title="Duplicate (Ctrl+D)" @mousedown.prevent @click="run('Duplicate', duplicateSelection)">
        <CopyPlus class="size-3.5" aria-hidden="true" />Duplicate
      </button>
      <button v-if="!isMulti" type="button" :class="button" :disabled="editingText" aria-label="Copy" title="Copy (Ctrl+C)" @mousedown.prevent @click="copy">
        <Copy class="size-3.5" aria-hidden="true" />Copy
      </button>
      <button type="button" :class="button" :disabled="editingText" aria-label="Delete" title="Delete (Del)" @mousedown.prevent @click="run('Delete', deleteSelection)">
        <Trash2 class="size-3.5" aria-hidden="true" />Delete
      </button>
    </div>
  </div>
</template>
