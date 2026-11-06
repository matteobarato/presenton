<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ChevronLeft, ChevronRight, Play, Sparkles } from 'lucide-vue-next'
import { useEditorStore } from '@/stores/editor'

const editor = useEditorStore()
const route = useRoute()
const id = computed(() => String(route.params.id ?? ''))

const btn =
  'grid size-8 place-items-center rounded-control text-muted transition-colors duration-200 hover:bg-white/[0.06] hover:text-white'
</script>

<template>
  <div role="toolbar" aria-label="Slide tools" class="glass-tools flex items-center gap-1 p-1">
    <button type="button" :class="btn" aria-label="Previous slide" title="Previous slide" @click="editor.prev()">
      <ChevronLeft class="size-4" aria-hidden="true" />
    </button>
    <button type="button" :class="btn" aria-label="Next slide" title="Next slide" @click="editor.next()">
      <ChevronRight class="size-4" aria-hidden="true" />
    </button>
    <span class="mx-1 h-4 w-px bg-line" aria-hidden="true" />
    <button
      type="button"
      :class="[btn, 'w-auto gap-1.5 px-2.5 text-[11px] font-semibold', editor.askOpen && 'bg-white/[0.08] text-accent']"
      :aria-pressed="editor.askOpen"
      title="Ask AI to edit this slide (Ctrl+K)"
      @click="editor.askOpen = !editor.askOpen"
    >
      <Sparkles class="size-3.5" aria-hidden="true" />Ask
    </button>
    <RouterLink
      :to="{ name: 'present', params: { id } }"
      :class="[btn, 'w-auto gap-1.5 px-2.5 text-[11px] font-semibold']"
      title="Present"
    >
      <Play class="size-3.5" aria-hidden="true" />Present
    </RouterLink>
  </div>
</template>
