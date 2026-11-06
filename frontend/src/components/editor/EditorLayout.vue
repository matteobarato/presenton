<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useEditorStore } from '@/stores/editor'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

/**
 * Aera three-column editor frame. Below 1050px the inspector becomes a right
 * drawer; below 760px the navigator becomes a left drawer.
 */
const editor = useEditorStore()
const narrowInspector = useMediaQuery('(max-width: 1050px)')
const narrowNavigator = useMediaQuery('(max-width: 760px)')

const inspectorDrawer = computed({
  get: () => narrowInspector.value && editor.inspectorOpen,
  set: (open) => (editor.inspectorOpen = open),
})
const navigatorDrawer = computed({
  get: () => narrowNavigator.value && editor.navigatorOpen,
  set: (open) => (editor.navigatorOpen = open),
})

// A drawer must not cover the canvas on load.
onMounted(() => {
  if (narrowInspector.value) editor.inspectorOpen = false
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" data-testid="editor-layout">
    <slot name="header" />
    <div class="flex min-h-0 flex-1 gap-3 pr-3 pb-3 max-[760px]:pr-2.5 max-[760px]:pl-2.5">
      <aside
        v-if="!narrowNavigator"
        aria-label="Slides"
        class="ml-3 flex w-[248px] flex-none flex-col overflow-hidden rounded-panel bg-storyboard max-[1279px]:w-[212px]"
      >
        <slot name="navigator" />
      </aside>
      <Sheet v-else v-model:open="navigatorDrawer">
        <SheetContent side="left" class="w-[min(260px,calc(100vw-48px))] bg-storyboard">
          <SheetTitle class="sr-only">Slides</SheetTitle>
          <SheetDescription class="sr-only">Slide navigator</SheetDescription>
          <slot name="navigator" />
        </SheetContent>
      </Sheet>

      <main class="flex min-w-0 flex-1 flex-col gap-2"><slot /></main>

      <aside
        v-if="!narrowInspector && editor.inspectorOpen"
        aria-label="Inspector"
        class="flex w-[320px] flex-none flex-col overflow-hidden rounded-panel bg-inspector max-[1279px]:w-[288px]"
      >
        <slot name="inspector" />
      </aside>
      <Sheet v-else-if="narrowInspector" v-model:open="inspectorDrawer">
        <SheetContent side="right" class="w-[min(340px,calc(100vw-24px))]">
          <SheetTitle class="sr-only">Inspector</SheetTitle>
          <SheetDescription class="sr-only">Design, chat, narration and export tools</SheetDescription>
          <slot name="inspector" />
        </SheetContent>
      </Sheet>
    </div>
  </div>
</template>
