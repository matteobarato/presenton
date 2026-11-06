<script setup lang="ts">
import { GripVertical, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

defineProps<{ index: number; disabled?: boolean; active?: boolean }>()
const content = defineModel<string>({ required: true })
const emit = defineEmits<{ remove: []; move: [delta: -1 | 1] }>()

function onKeydown(e: KeyboardEvent) {
  if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
  e.preventDefault()
  emit('move', e.key === 'ArrowUp' ? -1 : 1)
}
</script>

<template>
  <li
    class="outline-item flex items-start gap-2 rounded-card border border-white/[0.07] bg-white/[0.02] p-3 transition-colors duration-200"
    :class="active ? 'border-accent/40' : ''"
    data-testid="outline-item"
    @keydown="onKeydown"
  >
    <button
      type="button"
      class="drag-handle mt-1 grid size-6 shrink-0 cursor-grab place-items-center rounded text-muted hover:text-[#f6f8f9] disabled:cursor-default"
      :disabled="disabled"
      :aria-label="`Reorder slide ${index + 1} (Alt+Up or Alt+Down)`"
    >
      <GripVertical class="size-4" aria-hidden="true" />
    </button>
    <span class="mt-1.5 w-6 shrink-0 text-[11px] tabular-nums text-muted" aria-hidden="true">{{ index + 1 }}</span>
    <Textarea
      v-model="content"
      class="min-h-[72px] flex-1 resize-y text-[13px]"
      :disabled="disabled"
      :aria-label="`Slide ${index + 1} outline`"
    />
    <Button
      variant="ghost"
      size="icon"
      type="button"
      :disabled="disabled"
      :aria-label="`Delete slide ${index + 1}`"
      @click="emit('remove')"
    >
      <Trash2 class="size-4" aria-hidden="true" />
    </Button>
  </li>
</template>
