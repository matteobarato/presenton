<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { LayerNode } from '@/slide-editor/layerTree'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import LayerRow from './LayerRow.vue'

/** Everything on the slide; containers start collapsed and expand on demand. */
const props = defineProps<{ nodes: LayerNode[] }>()

const ctx = useSlideEditingContext()
const expanded = ref(new Set<string>())
const root = ref<HTMLElement | null>(null)

interface Row {
  node: LayerNode
  depth: number
}
const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const walk = (nodes: LayerNode[], depth: number) => {
    for (const node of nodes) {
      out.push({ node, depth })
      if (node.children.length > 0 && expanded.value.has(node.key)) walk(node.children, depth + 1)
    }
  }
  walk(props.nodes, 0)
  return out
})

function toggle(key: string, open?: boolean) {
  const next = new Set(expanded.value)
  if (open ?? !next.has(key)) next.add(key)
  else next.delete(key)
  expanded.value = next
}

function hover(node: LayerNode, on: boolean) {
  ctx.hover.value = on ? node.selection : null
}
function select(node: LayerNode) {
  ctx.hover.value = null
  ctx.select(node.selection)
}

function focusRow(i: number) {
  const buttons = root.value?.querySelectorAll<HTMLButtonElement>('[data-layer-select]')
  buttons?.[Math.max(0, Math.min(i, buttons.length - 1))]?.focus()
}
function onKeydown(e: KeyboardEvent, i: number) {
  const row = rows.value[i]
  if (!row) return
  if (e.key === 'ArrowDown') focusRow(i + 1)
  else if (e.key === 'ArrowUp') focusRow(i - 1)
  else if (e.key === 'ArrowRight' && row.node.children.length > 0) toggle(row.node.key, true)
  else if (e.key === 'ArrowLeft' && row.node.children.length > 0) toggle(row.node.key, false)
  else return
  e.preventDefault()
  e.stopPropagation()
}

onBeforeUnmount(() => {
  ctx.hover.value = null
})
</script>

<template>
  <div ref="root" role="tree" aria-label="Slide layers" class="-mx-2 flex flex-col">
    <div v-for="(row, i) in rows" :key="row.node.key" role="treeitem" :aria-level="row.depth + 1" @keydown="onKeydown($event, i)">
      <LayerRow
        :node="row.node"
        :depth="row.depth"
        :expandable="row.node.children.length > 0"
        :expanded="expanded.has(row.node.key)"
        @toggle="toggle(row.node.key)"
        @select="select(row.node)"
        @hover="hover(row.node, $event)"
      />
    </div>
    <p v-if="rows.length === 0" class="px-2 text-[10px] text-[#a0abb1]">This slide is empty.</p>
  </div>
</template>
