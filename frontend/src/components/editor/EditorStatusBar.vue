<script setup lang="ts">
import { Minus, NotebookPen, Plus } from 'lucide-vue-next'
import { useEditorStore, ZOOM_MAX, ZOOM_MIN } from '@/stores/editor'

defineProps<{ position: number; total: number }>()
const editor = useEditorStore()

const btn =
  'grid size-7 place-items-center rounded-control text-muted transition-colors duration-200 hover:bg-white/[0.06] hover:text-white disabled:opacity-35'
</script>

<template>
  <div class="flex h-9 flex-none items-center gap-3 px-1 text-[11px] text-muted">
    <span aria-live="polite" class="tabular-nums" data-testid="slide-position">Slide {{ position }} of {{ total }}</span>
    <button
      type="button"
      class="flex h-7 items-center gap-1.5 rounded-control px-2 font-semibold transition-colors duration-200 hover:bg-white/[0.06] hover:text-white"
      :class="editor.notesOpen && 'text-accent'"
      :aria-pressed="editor.notesOpen"
      @click="editor.notesOpen = !editor.notesOpen"
    >
      <NotebookPen class="size-3.5" aria-hidden="true" />Notes
    </button>
    <div class="ml-auto flex items-center gap-1" role="group" aria-label="Zoom">
      <button type="button" :class="btn" :disabled="editor.zoom <= ZOOM_MIN" aria-label="Zoom out" @click="editor.setZoom(editor.zoom - 0.25)">
        <Minus class="size-3.5" aria-hidden="true" />
      </button>
      <button type="button" class="min-w-11 rounded-control text-center tabular-nums hover:text-white" title="Reset zoom" @click="editor.setZoom(1)">
        {{ Math.round(editor.zoom * 100) }}%
      </button>
      <button type="button" :class="btn" :disabled="editor.zoom >= ZOOM_MAX" aria-label="Zoom in" @click="editor.setZoom(editor.zoom + 0.25)">
        <Plus class="size-3.5" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
