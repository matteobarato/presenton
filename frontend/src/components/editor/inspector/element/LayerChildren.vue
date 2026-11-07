<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import { layerPath, layerTree, type LayerNode } from '@/slide-editor/layerTree'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import LayerRow from './LayerRow.vue'

/** Where the selection sits on the slide (a breadcrumb) and what it contains, to move up and down the structure. */
const ctx = useSlideEditingContext()

const tree = computed(() => layerTree(ctx.ui.value))
const path = computed(() => layerPath(tree.value, ctx.ui.value, ctx.selection.value) ?? [])
const current = computed<LayerNode | null>(() => path.value[path.value.length - 1] ?? null)

// A multi-selection lists its members; picking one narrows the selection to it.
const items = computed<LayerNode[]>(() => {
  const sel = ctx.selection.value
  if (sel?.kind === 'multi-component') {
    return tree.value.filter((n) => n.selection.kind === 'component' && sel.componentIndexes.includes(n.selection.componentIndex))
  }
  return current.value?.children ?? []
})
const heading = computed(() => (ctx.selection.value?.kind === 'multi-component' ? 'Selected' : 'Contains'))

function hover(node: LayerNode, on: boolean) {
  ctx.hover.value = on ? node.selection : null
}
function select(node: LayerNode | null) {
  ctx.hover.value = null
  ctx.select(node ? node.selection : null)
}

onBeforeUnmount(() => {
  ctx.hover.value = null
})
</script>

<template>
  <div class="border-t border-line py-[18px] min-[1600px]:py-[22px]" data-testid="layer-children">
    <nav v-if="path.length > 0" aria-label="Selection path" class="mb-3 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] text-[#9aa9b0] min-[1600px]:text-[11px]">
      <button type="button" class="hover:text-white" @mousedown.prevent @click="select(null)">Slide</button>
      <template v-for="(node, i) in path" :key="node.key">
        <ChevronRight class="size-3 shrink-0 opacity-60" aria-hidden="true" />
        <span v-if="i === path.length - 1" class="font-medium text-[#f0f2f3]" aria-current="location">{{ node.label }}</span>
        <button
          v-else
          type="button"
          class="hover:text-white"
          @mousedown.prevent
          @mouseenter="hover(node, true)"
          @mouseleave="hover(node, false)"
          @click="select(node)"
        >
          {{ node.label }}
        </button>
      </template>
    </nav>
    <template v-if="items.length > 0">
      <h3 class="mb-2 text-[10px] font-medium text-[#d0d7dc] min-[1600px]:text-[11px]">{{ heading }}</h3>
      <div class="-mx-2 flex flex-col" role="list">
        <div v-for="node in items" :key="node.key" role="listitem">
          <LayerRow :node="node" @select="select(node)" @hover="hover(node, $event)" />
        </div>
      </div>
    </template>
  </div>
</template>
