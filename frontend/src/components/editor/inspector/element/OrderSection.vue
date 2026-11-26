<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { BringToFront, ChevronDown, ChevronUp, SendToBack } from 'lucide-vue-next'
import { reorderSelection, type LayerAction } from '@/slide-editor/ops'
import { useEditingActions } from '@/slide-editor/useEditingActions'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

const { t } = useI18n()

const ctx = useSlideEditingContext()
const actions = useEditingActions(ctx)
const editingText = computed(() => !!ctx.inlineEdit.value)

// `label` is the English name recorded in the undo history; the visible names come from `key` at render time.
const ACTIONS: Array<{ action: LayerAction; key: 'front' | 'up' | 'down' | 'back'; label: string; shortcut: string; icon: unknown }> = [
  { action: 'bring-to-front', key: 'front', label: 'Bring to front', shortcut: 'Shift+Ctrl+]', icon: BringToFront },
  { action: 'bring-forward', key: 'up', label: 'Bring forward', shortcut: 'Ctrl+]', icon: ChevronUp },
  { action: 'send-backward', key: 'down', label: 'Send backward', shortcut: 'Ctrl+[', icon: ChevronDown },
  { action: 'send-to-back', key: 'back', label: 'Send to back', shortcut: 'Shift+Ctrl+[', icon: SendToBack },
]
const actionName = (key: string, part: 'label' | 'short') => t(`editorInspector.element.order.${key}.${part}`)

// Which moves the selection allows: none at the top/bottom, inside a layout, or for several items.
const available = computed(() => {
  const ui = ctx.ui.value
  const sel = ctx.selection.value
  return new Set(ACTIONS.filter((a) => !!ui && reorderSelection(ui, sel, a.action) !== null).map((a) => a.action))
})

function run(action: LayerAction, label: string) {
  void actions.run(label, (ui) => reorderSelection(ui, ctx.selection.value, action))
}

const button =
  'inline-flex h-11 flex-col items-center justify-center gap-0.5 rounded-control border border-ov/[0.06] bg-field px-1 text-[9px] font-normal text-tx-c6ced3 hover:bg-sx-303a3f hover:text-strong disabled:opacity-35 disabled:hover:bg-field'
</script>

<template>
  <div class="border-t border-line py-[18px] min-[1600px]:py-[22px]">
    <div class="mb-3 flex items-center justify-between text-[10px] font-medium text-tx-d0d7dc min-[1600px]:text-[11px]">
      <h3>{{ t('editorInspector.element.order.title') }}</h3>
    </div>
    <div class="grid grid-cols-4 gap-2" role="group" :aria-label="t('editorInspector.element.order.title')">
      <button
        v-for="a in ACTIONS"
        :key="a.action"
        type="button"
        :class="button"
        :disabled="editingText || !available.has(a.action)"
        :aria-label="actionName(a.key, 'label')"
        :title="`${actionName(a.key, 'label')} (${a.shortcut})`"
        @mousedown.prevent
        @click="run(a.action, a.label)"
      >
        <component :is="a.icon" class="size-3.5" aria-hidden="true" />{{ actionName(a.key, 'short') }}
      </button>
    </div>
  </div>
</template>
