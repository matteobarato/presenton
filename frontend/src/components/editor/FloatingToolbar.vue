<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import { ChevronDown, ChevronUp, Ellipsis, LayoutPanelLeft, PanelRight, Plus, Redo2, Sparkles, Undo2 } from 'lucide-vue-next'
import { usePresentation } from '@/api/presentations'
import { useEditorFetchGate } from '@/composables/useEditorFetchGate'
import { useUndoRedo } from '@/composables/useUndoRedo'
import { slideKind } from '@/render/slide-kind'
import { useEditorStore } from '@/stores/editor'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { active, divider, tool } from './canvas/toolbars/toolbarClasses'

const editor = useEditorStore()
const { t } = useI18n()
const route = useRoute()
const { history, undo, redo } = useUndoRedo()
const id = computed(() => String(route.params.id ?? ''))
const { data: presentation } = usePresentation(id, useEditorFetchGate())
const narrow = useMediaQuery('(max-width: 760px)')
// The header is crowded below the inspector breakpoint: the slide tools fold into one menu, Ask AI stays.
const compact = useMediaQuery('(max-width: 1050px)')

const smart = computed(() => {
  const slide = presentation.value?.slides.find((s) => s.id === editor.activeSlideId)
  return slide ? slideKind(slide) === 'smart' : false
})
const askDisabled = computed(() => smart.value || editor.generating)
const askOpen = computed(() => editor.chatOpen)
const askTitle = computed(() =>
  smart.value ? t('editor.toolbar.askSmartUnavailable') : t('editor.toolbar.askTitle'),
)

const hasSlide = computed(() => Boolean(presentation.value?.slides.some((s) => s.id === editor.activeSlideId)))
const insertDisabled = computed(() => smart.value || !hasSlide.value || editor.locked)
const insertActive = computed(() => editor.inspectorOpen && editor.inspectorTab === 'insert')
const insertTitle = computed(() =>
  smart.value
    ? t('editor.toolbar.insertSmartUnavailable')
    : !hasSlide.value
      ? t('editor.toolbar.insertSelectSlide')
      : editor.locked
        ? t('editor.toolbar.insertBusy')
        : t('editor.toolbar.insertTitle'),
)

const slidesVisible = computed(() => (narrow.value ? editor.navigatorOpen : editor.navigatorVisible))
function toggleSlides() {
  if (narrow.value) editor.navigatorOpen = !editor.navigatorOpen
  else editor.navigatorVisible = !editor.navigatorVisible
}
</script>

<template>
  <div role="toolbar" :aria-label="t('editor.toolbar.slideTools')" class="flex flex-none items-center gap-[3px] max-[1279px]:gap-0 max-[450px]:gap-1">
    <DropdownMenu v-if="compact">
      <DropdownMenuTrigger :class="tool" :aria-label="t('editor.toolbar.slideTools')" :title="t('editor.toolbar.slideTools')">
        <Ellipsis class="size-[17px]" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" class="w-[min(230px,calc(100vw-24px))]">
        <DropdownMenuItem @select="toggleSlides">
          <LayoutPanelLeft class="size-[15px]" aria-hidden="true" />{{ slidesVisible ? t('editor.toolbar.hideSlides') : t('editor.toolbar.showSlides') }}
        </DropdownMenuItem>
        <DropdownMenuItem @select="editor.inspectorOpen = !editor.inspectorOpen">
          <PanelRight class="size-[15px]" aria-hidden="true" />{{ editor.inspectorOpen ? t('editor.toolbar.hideInspector') : t('editor.toolbar.showInspector') }}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem @select="editor.prev()"><ChevronUp class="size-[15px]" aria-hidden="true" />{{ t('editor.toolbar.previousSlide') }}</DropdownMenuItem>
        <DropdownMenuItem @select="editor.next()"><ChevronDown class="size-[15px]" aria-hidden="true" />{{ t('editor.toolbar.nextSlide') }}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem :disabled="!history.canUndo || editor.locked" @select="undo">
          <Undo2 class="size-[15px]" aria-hidden="true" />{{ history.undoLabel ? t('editor.toolbar.undoNamed', { label: history.undoLabel.toLowerCase() }) : t('editor.toolbar.undo') }}
        </DropdownMenuItem>
        <DropdownMenuItem :disabled="!history.canRedo || editor.locked" @select="redo">
          <Redo2 class="size-[15px]" aria-hidden="true" />{{ history.redoLabel ? t('editor.toolbar.redoNamed', { label: history.redoLabel.toLowerCase() }) : t('editor.toolbar.redo') }}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem :disabled="insertDisabled" @select="editor.openInsert()">
          <Plus class="size-[15px]" aria-hidden="true" />{{ t('editor.toolbar.insert') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <template v-else>
    <button
      type="button"
      :class="[tool, slidesVisible && active]"
      :aria-expanded="slidesVisible"
      :aria-label="slidesVisible ? t('editor.toolbar.hideSlides') : t('editor.toolbar.showSlides')"
      :title="slidesVisible ? t('editor.toolbar.hideSlides') : t('editor.toolbar.showSlides')"
      @click="toggleSlides"
    >
      <LayoutPanelLeft class="size-[17px]" aria-hidden="true" />
    </button>
    <button
      type="button"
      :class="[tool, editor.inspectorOpen && active]"
      :aria-expanded="editor.inspectorOpen"
      :aria-label="editor.inspectorOpen ? t('editor.toolbar.hideInspector') : t('editor.toolbar.showInspector')"
      :title="editor.inspectorOpen ? t('editor.toolbar.hideInspector') : t('editor.toolbar.showInspector')"
      @click="editor.inspectorOpen = !editor.inspectorOpen"
    >
      <PanelRight class="size-[17px]" aria-hidden="true" />
    </button>
    <span :class="divider" aria-hidden="true" />

    <button type="button" :class="tool" :aria-label="t('editor.toolbar.previousSlide')" :title="t('editor.toolbar.previousSlideShortcut')" @click="editor.prev()">
      <ChevronUp class="size-[17px]" aria-hidden="true" />
    </button>
    <button type="button" :class="tool" :aria-label="t('editor.toolbar.nextSlide')" :title="t('editor.toolbar.nextSlideShortcut')" @click="editor.next()">
      <ChevronDown class="size-[17px]" aria-hidden="true" />
    </button>
    <span :class="divider" aria-hidden="true" />

    <button
      type="button"
      :class="tool"
      :disabled="!history.canUndo || editor.locked"
      :aria-label="history.undoLabel ? t('editor.toolbar.undoNamed', { label: history.undoLabel.toLowerCase() }) : t('editor.toolbar.undo')"
      :title="t('editor.toolbar.undoTitle')"
      @click="undo"
    >
      <Undo2 class="size-4" aria-hidden="true" />
    </button>
    <button
      type="button"
      :class="tool"
      :disabled="!history.canRedo || editor.locked"
      :aria-label="history.redoLabel ? t('editor.toolbar.redoNamed', { label: history.redoLabel.toLowerCase() }) : t('editor.toolbar.redo')"
      :title="t('editor.toolbar.redoTitle')"
      @click="redo"
    >
      <Redo2 class="size-4" aria-hidden="true" />
    </button>
    <span :class="divider" aria-hidden="true" />

    <button
      type="button"
      :class="[tool, insertActive && active]"
      :disabled="insertDisabled"
      :aria-label="t('editor.toolbar.insert')"
      :title="insertTitle"
      @click="editor.openInsert()"
    >
      <Plus class="size-[17px]" aria-hidden="true" />
    </button>
    </template>
    <button
      type="button"
      class="flex h-[31px] items-center justify-center gap-[7px] rounded-[8px] bg-sx-3c4c552e px-2.5 text-[10px] font-medium whitespace-nowrap text-tx-c9e5f2 hover:bg-sx-475e6c80 hover:text-tx-e3f5fe max-[760px]:px-[9px] max-[450px]:gap-[5px] max-[450px]:px-[7px] max-[450px]:text-[9px] max-[380px]:px-[5px]"
      :class="[askOpen && 'bg-sx-475e6c80 text-tx-e3f5fe', askDisabled && 'opacity-50']"
      data-ask-button
      :aria-expanded="askOpen"
      aria-controls="ask-ai-panel"
      :title="askTitle"
      @click="editor.toggleAsk()"
    >
      <Sparkles class="size-[15px] max-[450px]:size-[13px]" aria-hidden="true" />{{ t('editor.toolbar.askAi') }}
    </button>
  </div>
</template>
