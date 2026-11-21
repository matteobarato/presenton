<script setup lang="ts">
import { computed, ref } from 'vue'
import { GripVertical, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { renderMarkdown } from '@/lib/mini-markdown'

const props = defineProps<{ index: number; disabled?: boolean; active?: boolean }>()
const content = defineModel<string>({ required: true })
const emit = defineEmits<{ remove: []; move: [delta: -1 | 1] }>()

/** The first non-empty line, without its markdown marker, reads as the slide title; the rest is the preview. */
function split(md: string): { title: string; rest: string } {
  const lines = md.split('\n')
  const at = lines.findIndex((l) => l.trim())
  if (at < 0) return { title: '', rest: '' }
  const title = lines[at]!
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^([-*+]|\d+[.)])\s+/, '')
    .replace(/\*\*|__|`/g, '')
    .trim()
  return { title, rest: lines.slice(at + 1).join('\n').trim() }
}

// The slide reads as a title plus a muted preview; focusing it (click, Tab or a programmatic focus) shows the
// source. The textarea never leaves the layout, it only sits invisibly over the preview, so it can always take focus.
const editing = ref(false)
const parts = computed(() => split(content.value))
const html = computed(() => renderMarkdown(parts.value.rest))
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
    class="outline-item group flex flex-wrap items-start gap-x-3 gap-y-1 rounded-card border bg-white/[0.02] py-3 pr-2 pl-3 max-[760px]:pr-3 transition-[border-color,background] duration-200"
    :class="showSource || active ? 'border-[#bee3f340] bg-white/[0.035]' : 'border-white/[0.07] hover:border-white/[0.12]'"
    data-testid="outline-item"
    @keydown="onKeydown"
  >
    <span
      class="mt-px grid size-6 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[12px] font-medium text-[#b8c7cf] tabular-nums"
      aria-hidden="true"
      data-testid="outline-number"
    >{{ index + 1 }}</span>
    <div class="relative min-w-0 flex-1 basis-0">
      <div v-show="!showSource" class="min-h-[24px] px-1 py-0.5" aria-hidden="true">
        <p v-if="parts.title" class="text-[14px] leading-[1.5] font-medium tracking-[-0.01em] text-[#e9f1f5]" data-testid="outline-title">
          {{ parts.title }}
        </p>
        <p v-else class="text-[13px] leading-[1.5] text-[#7f8d95]">Empty slide. Click to write.</p>
        <!-- eslint-disable-next-line vue/no-v-html -- sanitised by renderMarkdown (DOMPurify) -->
        <div v-if="parts.rest" class="outline-md mt-1 text-[12px] leading-[1.65] text-[#93a5ae]" data-testid="outline-preview" v-html="html" />
      </div>
      <textarea
        v-model="content"
        :disabled="disabled"
        :aria-label="`Slide ${index + 1} outline`"
        class="w-full resize-none rounded-control text-[13px] leading-[1.65] text-[#e2eef5] outline-none! [field-sizing:content]"
        :class="showSource ? 'relative min-h-[72px] bg-[#1b2226] px-2.5 py-2 ring-1 ring-[#bee3f355]' : 'absolute inset-0 h-full cursor-text opacity-0 disabled:cursor-default'"
        @focus="editing = true"
        @blur="editing = false"
      />
    </div>
    <!-- Editing tools stay out of the way: they show on hover or focus (under 760px, in a row under the text once the slide is focused, so titles keep the full width; it collapses after a short delay so a tap on a button isn't lost to the blur), and not at all while read-only. -->
    <div
      class="flex shrink-0 items-center opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100 max-[760px]:max-h-0 max-[760px]:w-full max-[760px]:justify-end max-[760px]:overflow-hidden max-[760px]:transition-[max-height,opacity] max-[760px]:delay-300 max-[760px]:group-focus-within:max-h-11 max-[760px]:group-focus-within:delay-0"
      :class="disabled && 'invisible'"
    >
      <button
        type="button"
        class="drag-handle grid size-8 max-[760px]:size-11 cursor-grab place-items-center rounded text-muted hover:text-[#f6f8f9] disabled:cursor-default"
        :disabled="disabled"
        :aria-label="`Reorder slide ${index + 1} (Alt+Up or Alt+Down)`"
      >
        <GripVertical class="size-4" aria-hidden="true" />
      </button>
      <Button
        variant="ghost"
        size="icon"
        class="max-[760px]:size-11"
        type="button"
        :disabled="disabled"
        :aria-label="`Delete slide ${index + 1}`"
        @click="emit('remove')"
      >
        <Trash2 class="size-4" aria-hidden="true" />
      </Button>
    </div>
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
