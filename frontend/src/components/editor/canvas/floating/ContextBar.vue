<script setup lang="ts">
import { nextTick, onMounted, onUpdated, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { active, container, divider, tool } from '@/components/editor/canvas/toolbars/toolbarClasses'
import type { BarContext, BarItem } from './barItems'
import { guardKeys } from './guardKeys'
import PanelPopover from './PanelPopover.vue'
import { TAIL_IDS } from './tail'

/** The bar itself: renders the items for the selection's kind, with one popover open at a time. */
const props = defineProps<{
  items: BarItem[]
  context: BarContext
  /** Id of the open panel, or null. */
  openPanel: string | null
  side?: 'top' | 'bottom'
}>()
const emit = defineEmits<{ 'update:openPanel': [id: string | null] }>()
const { t } = useI18n()

const root = ref<HTMLElement | null>(null)

// A divider separates the kind's own controls from the common tail, and sets Duplicate/Delete apart.
function dividerBefore(item: BarItem, index: number): boolean {
  if (index === 0) return false
  if (item.id === 'duplicate') return true
  return item.id === TAIL_IDS.find((id) => props.items.some((i) => i.id === id))
}

function setOpen(id: string, open: boolean) {
  if (open) emit('update:openPanel', id)
  else if (props.openPanel === id) emit('update:openPanel', null)
}

const bar = () => props.context
const focusables = () => Array.from(root.value?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])

// Roving tabindex: one tab stop in the bar (the last focused control, else the first); arrows move within.
let lastFocused: HTMLElement | null = null
function syncTabStops() {
  const els = focusables()
  const current = lastFocused && els.includes(lastFocused) ? lastFocused : els[0]
  for (const el of els) el.tabIndex = el === current ? 0 : -1
}
onMounted(syncTabStops)
onUpdated(syncTabStops)
// Disabled states change from the editing state, not from this component's props.
function onFocusin(e: FocusEvent) {
  if (e.target instanceof HTMLElement && focusables().includes(e.target)) {
    lastFocused = e.target
    syncTabStops()
  }
}

function onKeydown(e: KeyboardEvent) {
  // Keys the slide's shortcuts would take for the element (nudge, enter-to-edit) stay with the bar.
  if (e.key === 'Enter' || e.key === ' ') {
    e.stopPropagation()
    return
  }
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return guardKeys(e)
  // Fields in the bar keep their own caret keys.
  if (!(e.target instanceof HTMLButtonElement)) return guardKeys(e)
  e.preventDefault()
  e.stopPropagation()
  const els = focusables()
  if (!els.length) return
  const at = els.indexOf(document.activeElement as HTMLElement)
  const target =
    e.key === 'Home' ? 0 : e.key === 'End' ? els.length - 1 : (Math.max(at, 0) + (e.key === 'ArrowRight' ? 1 : els.length - 1)) % els.length
  els[target]?.focus()
  void nextTick(syncTabStops)
}
</script>

<template>
  <div
    ref="root"
    role="toolbar"
    :aria-label="t('editorCanvas.bar.toolbarLabel')"
    aria-orientation="horizontal"
    data-inline-edit-ignore="true"
    :class="[container, 'max-w-[calc(100%-16px)] overflow-x-auto overflow-y-hidden']"
    @focusin="onFocusin"
    @keydown="onKeydown"
  >
    <template v-for="(item, i) in items" :key="item.id">
      <span v-if="dividerBefore(item, i)" :class="divider" role="separator" aria-orientation="vertical" />
      <button
        v-if="item.type === 'button'"
        type="button"
        :class="[tool, item.active?.(bar()) && active]"
        :aria-label="t(item.label)"
        :title="t(item.title ?? item.label)"
        :aria-pressed="item.active ? !!item.active(bar()) : undefined"
        :disabled="item.disabled?.(bar())"
        :data-bar-item="item.id"
        @mousedown.prevent
        @click="item.run(bar())"
      >
        <component :is="item.icon" class="size-4" aria-hidden="true" />
      </button>
      <component :is="item.component" v-else-if="item.type === 'custom'" v-bind="item.props?.(bar())" />
      <PanelPopover
        v-else
        :item="item"
        :context="bar()"
        :open="openPanel === item.id"
        :side="side"
        @update:open="setOpen(item.id, $event)"
      />
    </template>
  </div>
</template>
