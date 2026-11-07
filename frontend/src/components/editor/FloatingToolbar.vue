<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import { ChevronDown, ChevronUp, LayoutPanelLeft, PanelRight, Redo2, Sparkles, Undo2 } from 'lucide-vue-next'
import { usePresentation } from '@/api/presentations'
import { useEditorFetchGate } from '@/composables/useEditorFetchGate'
import { useUndoRedo } from '@/composables/useUndoRedo'
import { slideKind } from '@/render/slide-kind'
import { useEditorStore } from '@/stores/editor'
import { useSlideEditingContextOptional } from '@/slide-editor/useSlideEditing'
import ContextToolbar from './canvas/toolbars/ContextToolbar.vue'
import { active, container, divider, tool } from './canvas/toolbars/toolbarClasses'

const editor = useEditorStore()
const route = useRoute()
const { history, undo, redo } = useUndoRedo()
const id = computed(() => String(route.params.id ?? ''))
const { data: presentation } = usePresentation(id, useEditorFetchGate())
const editing = useSlideEditingContextOptional()
const hasSelection = computed(() => !!editing?.enabled.value && editing.selection.value !== null)
const narrow = useMediaQuery('(max-width: 760px)')

const smart = computed(() => {
  const slide = presentation.value?.slides.find((s) => s.id === editor.activeSlideId)
  return slide ? slideKind(slide) === 'smart' : false
})
const askDisabled = computed(() => smart.value || editor.generating)
const askOpen = computed(() => editor.chatOpen)
const askTitle = computed(() =>
  smart.value ? 'AI edit is available for template slides' : 'Ask AI to edit this slide (Ctrl+K)',
)

const slidesVisible = computed(() => (narrow.value ? editor.navigatorOpen : editor.navigatorVisible))
function toggleSlides() {
  if (narrow.value) editor.navigatorOpen = !editor.navigatorOpen
  else editor.navigatorVisible = !editor.navigatorVisible
}
</script>

<template>
  <ContextToolbar v-if="hasSelection" />
  <div v-else role="toolbar" aria-label="Slide tools" :class="container">
    <button
      type="button"
      :class="[tool, slidesVisible && active]"
      :aria-expanded="slidesVisible"
      :aria-label="slidesVisible ? 'Hide slides' : 'Show slides'"
      :title="slidesVisible ? 'Hide slides' : 'Show slides'"
      @click="toggleSlides"
    >
      <LayoutPanelLeft class="size-[17px]" aria-hidden="true" />
    </button>
    <button
      type="button"
      :class="[tool, editor.inspectorOpen && active]"
      :aria-expanded="editor.inspectorOpen"
      :aria-label="editor.inspectorOpen ? 'Hide inspector' : 'Show inspector'"
      :title="editor.inspectorOpen ? 'Hide inspector' : 'Show inspector'"
      @click="editor.inspectorOpen = !editor.inspectorOpen"
    >
      <PanelRight class="size-[17px]" aria-hidden="true" />
    </button>
    <span :class="divider" aria-hidden="true" />

    <button type="button" :class="tool" aria-label="Previous slide" title="Previous slide (↑)" @click="editor.prev()">
      <ChevronUp class="size-[17px]" aria-hidden="true" />
    </button>
    <button type="button" :class="tool" aria-label="Next slide" title="Next slide (↓)" @click="editor.next()">
      <ChevronDown class="size-[17px]" aria-hidden="true" />
    </button>
    <span :class="divider" aria-hidden="true" />

    <button
      type="button"
      :class="tool"
      :disabled="!history.canUndo || editor.locked"
      :aria-label="history.undoLabel ? `Undo ${history.undoLabel.toLowerCase()}` : 'Undo'"
      title="Undo (Ctrl+Z)"
      @click="undo"
    >
      <Undo2 class="size-4" aria-hidden="true" />
    </button>
    <button
      type="button"
      :class="tool"
      :disabled="!history.canRedo || editor.locked"
      :aria-label="history.redoLabel ? `Redo ${history.redoLabel.toLowerCase()}` : 'Redo'"
      title="Redo (Shift+Ctrl+Z)"
      @click="redo"
    >
      <Redo2 class="size-4" aria-hidden="true" />
    </button>
    <span :class="divider" aria-hidden="true" />

    <button
      type="button"
      class="flex h-[31px] items-center justify-center gap-[7px] rounded-[8px] bg-[#3c4c552e] px-2.5 text-[10px] font-medium whitespace-nowrap text-[#c9e5f2] hover:bg-[#475e6c80] hover:text-[#e3f5fe] max-[760px]:px-[9px] max-[450px]:gap-[5px] max-[450px]:px-[7px] max-[450px]:text-[9px] max-[380px]:px-[5px]"
      :class="[askOpen && 'bg-[#475e6c80] text-[#e3f5fe]', askDisabled && 'opacity-50']"
      data-ask-button
      :aria-expanded="askOpen"
      aria-controls="ask-ai-panel"
      :title="askTitle"
      @click="editor.toggleAsk()"
    >
      <Sparkles class="size-[15px] max-[450px]:size-[13px]" aria-hidden="true" />Ask AI
    </button>
  </div>
</template>
