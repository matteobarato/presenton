<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useEditorStore } from '@/stores/editor'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

/**
 * Aera editor frame: storyboard, canvas, inspector and the Ask AI column.
 * Docked panels stay mounted and collapse by animating their width, so the
 * canvas (and the slide, which scales from it) resizes smoothly instead of
 * jumping. Below 1050px the inspector is a right drawer, below 760px the
 * storyboard is a left drawer, and below 1280px Ask AI slides over as a drawer.
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

// Ask AI docks right of the inspector from 1280px up; below that it slides over as a drawer.
// It stays mounted once opened, so closing it never cuts off a reply that is still streaming.
const narrowChat = useMediaQuery('(max-width: 1279px)')
const chatMounted = ref(editor.chatOpen)
watch(
  () => editor.chatOpen,
  (open) => {
    if (open) chatMounted.value = true
  },
)

const navigatorDocked = computed(() => !narrowNavigator.value && editor.navigatorVisible)
const inspectorDocked = computed(() => !narrowInspector.value && editor.inspectorOpen)
const chatDocked = computed(() => !narrowChat.value && editor.chatOpen)

// A drawer must not cover the canvas on load.
onMounted(() => {
  if (narrowInspector.value) editor.inspectorOpen = false
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" data-testid="editor-layout">
    <slot name="header" />
    <!-- Aera columns: 180 / fluid / 260 (210 / 280 at 1600+, 160 / 240 below 1280), then the
         optional Ask AI column at the far right. Widths and gaps are variables so the
         collapsing wrappers can animate them. -->
    <div
      class="editor-columns flex min-h-0 flex-1 pr-4 pl-3 max-[1279px]:pr-3 max-[1279px]:pl-2.5 max-[760px]:px-2.5"
    >
      <div
        v-if="!narrowNavigator"
        class="panel-collapse"
        :style="{ width: navigatorDocked ? 'var(--nav-w)' : '0px', marginRight: navigatorDocked ? 'var(--col-gap)' : '0px' }"
        :data-state="navigatorDocked ? 'open' : 'closed'"
        :inert="!navigatorDocked"
      >
        <aside
          aria-label="Slides"
          class="panel-collapse-inner flex h-full w-[var(--nav-w)] flex-col overflow-hidden rounded-panel bg-storyboard"
        >
          <slot name="navigator" />
        </aside>
      </div>
      <Sheet v-else v-model:open="navigatorDrawer">
        <SheetContent side="left" class="w-[min(220px,calc(100vw-48px))] bg-storyboard">
          <SheetTitle class="sr-only">Slides</SheetTitle>
          <SheetDescription class="sr-only">Slide navigator</SheetDescription>
          <slot name="navigator" />
        </SheetContent>
      </Sheet>

      <main class="flex min-w-0 flex-1 flex-col gap-2"><slot /></main>

      <div
        v-if="!narrowInspector"
        class="panel-collapse"
        :style="{ width: inspectorDocked ? 'var(--insp-w)' : '0px', marginLeft: inspectorDocked ? 'var(--col-gap)' : '0px' }"
        :data-state="inspectorDocked ? 'open' : 'closed'"
        :inert="!inspectorDocked"
      >
        <aside
          aria-label="Inspector"
          class="panel-collapse-inner flex h-full w-[var(--insp-w)] flex-col overflow-hidden rounded-panel bg-inspector"
        >
          <slot name="inspector" />
        </aside>
      </div>
      <Sheet v-else v-model:open="inspectorDrawer">
        <SheetContent side="right" class="w-[min(340px,calc(100vw-24px))]">
          <SheetTitle class="sr-only">Inspector</SheetTitle>
          <SheetDescription class="sr-only">Design and narration tools</SheetDescription>
          <slot name="inspector" />
        </SheetContent>
      </Sheet>

      <Transition name="backdrop">
        <div
          v-if="narrowChat && editor.chatOpen"
          class="fixed inset-0 z-50 bg-[#080e1266]"
          aria-hidden="true"
          @click="editor.chatOpen = false"
        />
      </Transition>
      <!-- Docked: a collapsing column. Narrow: the wrapper has no width and the panel is a fixed drawer. -->
      <div
        class="panel-collapse"
        :style="{ width: chatDocked ? 'var(--chat-w)' : '0px', marginLeft: chatDocked ? 'var(--col-gap)' : '0px' }"
        :data-state="chatDocked ? 'open' : 'closed'"
      >
        <aside
          id="ask-ai-panel"
          aria-label="Ask AI"
          :data-state="editor.chatOpen ? 'open' : 'closed'"
          :inert="!editor.chatOpen"
          :role="narrowChat ? 'dialog' : undefined"
          :aria-modal="narrowChat && editor.chatOpen ? true : undefined"
          class="flex flex-col overflow-hidden rounded-panel bg-inspector"
          :class="narrowChat ? 'chat-drawer' : 'panel-collapse-inner h-full w-[var(--chat-w)]'"
          @keydown.esc="narrowChat && (editor.chatOpen = false)"
        >
          <slot v-if="chatMounted" name="chat" />
        </aside>
      </div>
    </div>
  </div>
</template>
