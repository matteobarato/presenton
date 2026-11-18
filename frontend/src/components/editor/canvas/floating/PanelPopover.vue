<script setup lang="ts">
import { computed } from 'vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { active, tool } from '@/components/editor/canvas/toolbars/toolbarClasses'
import type { BarContext, BarItem } from './barItems'
import { guardKeys } from './guardKeys'

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

// Colour pickers, selects and dialogs opened from a panel portal out of it; a click in them is not "outside".
function keepForNestedLayer(e: Event) {
  const target = (e as CustomEvent<{ originalEvent?: Event }>).detail?.originalEvent?.target as HTMLElement | null
  if (target?.closest?.('[data-reka-popper-content-wrapper], [role="dialog"], [role="listbox"]')) e.preventDefault()
}

const panelProps = computed(() => props.item.props?.(props.context) ?? {})
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
      class="max-h-[min(70vh,520px,var(--reka-popper-available-height))] w-[300px] max-w-[calc(100vw-16px)] overflow-y-auto"
      :aria-label="item.label"
      data-inline-edit-ignore="true"
      data-floating-panel
      @interact-outside="keepForNestedLayer"
      @open-auto-focus.prevent
      @close-auto-focus.prevent
      @keydown="guardKeys"
    >
      <component :is="item.component" v-bind="panelProps" />
    </PopoverContent>
  </Popover>
</template>
