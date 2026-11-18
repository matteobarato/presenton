<script setup lang="ts">
import { computed } from 'vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { active, tool } from '@/components/editor/canvas/toolbars/toolbarClasses'
import type { BarContext, BarItem } from './barItems'

type PanelItem = Extract<BarItem, { type: 'panel' }>

/** A bar button that opens a 300px popover with the panel's component. Open state is owned by the host. */
const props = defineProps<{
  item: PanelItem
  context: BarContext
  open: boolean
  /** Side of the button the popover opens on: 'top' when the bar is docked at the bottom. */
  side?: 'top' | 'bottom'
}>()
defineEmits<{ 'update:open': [open: boolean] }>()

const panelProps = computed(() => props.item.props?.(props.context) ?? {})

// Panel buttons and fields must not drive the slide's keyboard shortcuts (nudge, delete, enter-to-edit)
// or leave a focused button to the inline editor; typing in fields is unaffected.
const SHORTCUT_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Delete', 'Backspace'])
function guardKeys(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  if (el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName ?? '')) return
  if (SHORTCUT_KEYS.has(e.key)) e.stopPropagation()
}
</script>

<template>
  <Popover :open="open" @update:open="$emit('update:open', $event)">
    <PopoverTrigger as-child>
      <button
        type="button"
        :class="[tool, open && active]"
        :aria-label="item.label"
        :title="item.label"
        :data-bar-item="item.id"
        @mousedown.prevent
      >
        <component :is="item.icon" class="size-4" aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent
      :side="side ?? 'bottom'"
      :side-offset="10"
      :collision-padding="8"
      class="max-h-[min(70vh,520px)] w-[300px] max-w-[calc(100vw-16px)] overflow-y-auto"
      :aria-label="item.label"
      data-inline-edit-ignore="true"
      @open-auto-focus.prevent
      @close-auto-focus.prevent
      @keydown="guardKeys"
    >
      <component :is="item.component" v-bind="panelProps" />
    </PopoverContent>
  </Popover>
</template>
