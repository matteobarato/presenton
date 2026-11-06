<script setup lang="ts">
import { nextTick, ref, toRaw } from 'vue'
import draggable from 'vuedraggable'
import { Plus } from 'lucide-vue-next'
import { MAX_OUTLINE_SLIDES, type OutlineItem as Item } from '@/api/outlines'
import { Button } from '@/components/ui/button'
import OutlineItem from './OutlineItem.vue'

const props = defineProps<{ disabled?: boolean }>()
const items = defineModel<Item[]>({ required: true })

// Stable keys by object identity, so reordering keeps DOM and focus with the item.
const keys = new WeakMap<Item, number>()
let nextKey = 0
function keyOf(proxied: Item): number {
  const item = toRaw(proxied)
  let k = keys.get(item)
  if (k === undefined) keys.set(item, (k = nextKey++))
  return k
}

const root = ref<HTMLElement | null>(null)

function focusItem(item: Item) {
  void nextTick(() => {
    root.value?.querySelector<HTMLTextAreaElement>(`[data-key="${keyOf(item)}"] textarea`)?.focus()
  })
}

function move(index: number, delta: -1 | 1) {
  const target = index + delta
  if (target < 0 || target >= items.value.length) return
  const next = [...items.value]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item!)
  items.value = next
  focusItem(item!)
}

function remove(index: number) {
  items.value = items.value.filter((_, i) => i !== index)
}

function add() {
  const item: Item = { content: '' }
  items.value = [...items.value, item]
  focusItem(item)
}

function setContent(index: number, content: string) {
  const next = [...items.value]
  next[index] = { content }
  // Keep the key of the edited slide so the textarea is not re-created.
  keys.set(toRaw(next[index]!), keyOf(items.value[index]!))
  items.value = next
}
</script>

<template>
  <div ref="root" class="flex flex-col gap-3">
    <draggable
      v-model="items"
      tag="ol"
      handle=".drag-handle"
      :item-key="keyOf"
      :disabled="props.disabled"
      :animation="180"
      class="flex flex-col gap-2"
    >
      <template #item="{ element, index }">
        <OutlineItem
          :data-key="keyOf(element)"
          :index="index"
          :disabled="props.disabled"
          :model-value="element.content"
          @update:model-value="setContent(index, $event)"
          @remove="remove(index)"
          @move="move(index, $event)"
        />
      </template>
    </draggable>
    <Button
      variant="outline"
      type="button"
      class="self-start"
      :disabled="props.disabled || items.length >= MAX_OUTLINE_SLIDES"
      @click="add"
    >
      <Plus class="size-4" aria-hidden="true" />
      Add slide
    </Button>
  </div>
</template>
