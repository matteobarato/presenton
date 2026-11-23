<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { Copy, CopyPlus, Group, Trash2, Ungroup } from 'lucide-vue-next'
import { deleteSelection, duplicateSelection, ungroupSelection } from '@/slide-editor/ops'
import { isGroupSelection, toolbarKind } from '@/slide-editor/toolbarKind'
import { useClipboard } from '@/slide-editor/useClipboard'
import { useEditingActions } from '@/slide-editor/useEditingActions'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import { groupSelected } from './groupAction'

const { t } = useI18n()

const ctx = useSlideEditingContext()
const actions = useEditingActions(ctx)
const clipboard = useClipboard()
const isGroup = computed(() => isGroupSelection(ctx.ui.value, ctx.selection.value))
const isMulti = computed(() => toolbarKind(ctx.ui.value, ctx.selection.value) === 'multi')
// Structural tools wait while text is being typed (the keyboard shortcuts are off then too).
const editingText = computed(() => !!ctx.inlineEdit.value)

const button =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-control border border-ov/[0.06] bg-field px-2 text-[10px] font-normal text-tx-c6ced3 hover:bg-sx-303a3f hover:text-white disabled:opacity-35 disabled:hover:bg-field'

function run(label: string, op: typeof duplicateSelection) {
  void actions.run(label, (ui) => op(ui, ctx.selection.value))
}
function copy() {
  const ui = ctx.ui.value
  if (ui && ctx.selection.value) void clipboard.copy(ui, ctx.selection.value)
}
</script>

<template>
  <div class="border-t border-line py-[18px] min-[1600px]:py-[22px]">
    <div class="mb-3 flex items-center justify-between text-[10px] font-medium text-tx-d0d7dc min-[1600px]:text-[11px]">
      <h3>{{ t('editorInspector.element.arrange.title') }}</h3>
    </div>
    <div class="grid grid-cols-3 gap-2">
      <button v-if="isMulti" type="button" :class="button" :disabled="editingText" :aria-label="t('editorInspector.element.arrange.group')" :title="t('editorInspector.element.arrange.groupShortcut')" @mousedown.prevent @click="groupSelected(ctx)">
        <Group class="size-3.5" aria-hidden="true" />{{ t('editorInspector.element.arrange.group') }}
      </button>
      <button v-if="isGroup" type="button" :class="button" :disabled="editingText" :aria-label="t('editorInspector.element.arrange.ungroup')" :title="t('editorInspector.element.arrange.ungroupShortcut')" @mousedown.prevent @click="run('Ungroup', ungroupSelection)">
        <Ungroup class="size-3.5" aria-hidden="true" />{{ t('editorInspector.element.arrange.ungroup') }}
      </button>
      <button type="button" :class="button" :disabled="editingText" :aria-label="t('editorInspector.element.arrange.duplicate')" :title="t('editorInspector.element.arrange.duplicateShortcut')" @mousedown.prevent @click="run('Duplicate', duplicateSelection)">
        <CopyPlus class="size-3.5" aria-hidden="true" />{{ t('editorInspector.element.arrange.duplicate') }}
      </button>
      <button v-if="!isMulti" type="button" :class="button" :disabled="editingText" :aria-label="t('editorInspector.element.arrange.copy')" :title="t('editorInspector.element.arrange.copyShortcut')" @mousedown.prevent @click="copy">
        <Copy class="size-3.5" aria-hidden="true" />{{ t('editorInspector.element.arrange.copy') }}
      </button>
      <button type="button" :class="button" :disabled="editingText" :aria-label="t('common.actions.delete')" :title="t('editorInspector.element.arrange.deleteShortcut')" @mousedown.prevent @click="run('Delete', deleteSelection)">
        <Trash2 class="size-3.5" aria-hidden="true" />{{ t('common.actions.delete') }}
      </button>
    </div>
  </div>
</template>
