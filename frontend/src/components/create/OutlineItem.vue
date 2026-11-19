<script setup lang="ts">
import { computed, ref } from 'vue'
import { GripVertical, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { renderMarkdown } from '@/lib/mini-markdown'

const props = defineProps<{ index: number; disabled?: boolean; active?: boolean }>()
const content = defineModel<string>({ required: true })
const emit = defineEmits<{ remove: []; move: [delta: -1 | 1] }>()

// The slide reads as rendered markdown; focusing it (click, Tab or a programmatic focus) shows the source.
// The textarea never leaves the layout, it only sits invisibly over the preview, so it can always take focus.
const editing = ref(false)
const html = computed(() => renderMarkdown(content.value))
const showSource = computed(() => editing.value && !props.disabled)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && editing.value) {
    ;(e.target as HTMLElement).blur?.()
    return
  }
  if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
  e.preventDefault()
  emit('move', e.key === 'ArrowUp' ? -1 : 1)
}
</script>

<template>
  <li
    class="outline-item group flex items-start gap-2 rounded-card border bg-white/[0.02] p-3 transition-[border-color,background] duration-200"
    :class="showSource || active ? 'border-[#bee3f340] bg-white/[0.035]' : 'border-white/[0.07] hover:border-white/[0.12]'"
    data-testid="outline-item"
    @keydown="onKeydown"
  >
    <button
      type="button"
      class="drag-handle mt-0.5 grid size-6 shrink-0 cursor-grab place-items-center rounded text-muted hover:text-[#f6f8f9] disabled:cursor-default"
      :disabled="disabled"
      :aria-label="`Reorder slide ${index + 1} (Alt+Up or Alt+Down)`"
    >
      <GripVertical class="size-4" aria-hidden="true" />
    </button>
    <span class="mt-1 w-6 shrink-0 text-[11px] text-muted tabular-nums" aria-hidden="true">{{ index + 1 }}</span>
    <div class="relative min-w-0 flex-1">
      <!-- eslint-disable-next-line vue/no-v-html -- sanitised by renderMarkdown (DOMPurify) -->
      <div v-show="!showSource" class="outline-md min-h-[24px] px-1 py-0.5 text-[13px] leading-[1.65] text-[#d6e3ea]" aria-hidden="true" data-testid="outline-preview" v-html="html" />
      <p v-if="!showSource && !content.trim()" class="pointer-events-none absolute inset-0 px-1 py-0.5 text-[13px] text-[#7f8d95]" aria-hidden="true">
        Empty slide. Click to write.
      </p>
      <textarea
        v-model="content"
        :disabled="disabled"
        :aria-label="`Slide ${index + 1} outline`"
        class="w-full resize-none rounded-control text-[13px] leading-[1.65] text-[#e2eef5] outline-none! [field-sizing:content]"
        :class="showSource ? 'relative min-h-[72px] bg-[#1b2226] px-2.5 py-2 ring-1 ring-[#bee3f355]' : 'absolute inset-0 h-full cursor-text opacity-0'"
        @focus="editing = true"
        @blur="editing = false"
      />
    </div>
    <Button
      variant="ghost"
      size="icon"
      type="button"
      class="opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
      :disabled="disabled"
      :aria-label="`Delete slide ${index + 1}`"
      @click="emit('remove')"
    >
      <Trash2 class="size-4" aria-hidden="true" />
    </Button>
  </li>
</template>

<style scoped>
.outline-md :deep(h1),
.outline-md :deep(h2),
.outline-md :deep(h3),
.outline-md :deep(h4),
.outline-md :deep(h5),
.outline-md :deep(h6) { color: #eef5f9; font-weight: 600; letter-spacing: -0.015em; line-height: 1.35; }
.outline-md :deep(h1) { font-size: 16px; }
.outline-md :deep(h2) { font-size: 15px; }
.outline-md :deep(h3), .outline-md :deep(h4), .outline-md :deep(h5), .outline-md :deep(h6) { font-size: 14px; }
.outline-md :deep(* + *) { margin-top: 0.4em; }
.outline-md :deep(ul) { list-style: disc; padding-left: 1.25em; }
.outline-md :deep(ol) { list-style: decimal; padding-left: 1.25em; }
.outline-md :deep(li) { margin-top: 0.15em; }
.outline-md :deep(li::marker) { color: #8fb4c6; }
.outline-md :deep(strong) { color: #eef5f9; font-weight: 600; }
.outline-md :deep(code) { font-family: ui-monospace, monospace; font-size: 12px; background: #0003; padding: 0 3px; border-radius: 4px; }
.outline-md :deep(pre) { overflow-x: auto; background: #0004; padding: 8px; border-radius: 8px; }
.outline-md :deep(pre code) { background: none; padding: 0; }
.outline-md :deep(a) { color: var(--color-accent); text-decoration: underline; text-underline-offset: 2px; }
.outline-md :deep(table) { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; font-size: 12px; }
.outline-md :deep(th), .outline-md :deep(td) { border: 1px solid #ffffff17; padding: 5px 9px; text-align: left; vertical-align: top; }
.outline-md :deep(th) { background: #ffffff0a; color: #eef5f9; font-weight: 600; }
.outline-md :deep(th[align=center]), .outline-md :deep(td[align=center]) { text-align: center; }
.outline-md :deep(th[align=right]), .outline-md :deep(td[align=right]) { text-align: right; font-variant-numeric: tabular-nums; }
</style>
