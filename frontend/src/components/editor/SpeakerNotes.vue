<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import { AudioLines, ChevronDown, Clapperboard, MessageSquare } from 'lucide-vue-next'
import type { Presentation, Slide } from '@/api/types'
import { useEditorStore, type FooterTab } from '@/stores/editor'
import { clampFooterHeight, FOOTER_KEY_STEP, FOOTER_MAX_RATIO, FOOTER_MIN_HEIGHT } from './footerHeight'
import MotionTimeline from './MotionTimeline.vue'
import NotesStrip from './NotesStrip.vue'
import VoiceTab from './inspector/VoiceTab.vue'

/**
 * Aera footer of the canvas card: a Notes | Voice | Motion tab bar that opens a resizable body under the slide.
 * Collapsed by default. The body height is the store's raw px, clamped to the card where it is rendered.
 */
const props = defineProps<{ presentationId: string; presentation: Presentation; slide: Slide | null }>()
const editor = useEditorStore()

const tabs: { id: FooterTab; label: string }[] = [
  { id: 'notes', label: 'Notes' },
  { id: 'voice', label: 'Voice' },
  { id: 'motion', label: 'Motion' },
]

// Notes mounts once opened and is dropped when its tab is left: unmounting NotesStrip flushes a pending note.
// Voice mounts on first open, then stays (v-show) so a running generation and its state survive tab switches.
// Motion mounts while its tab is shown: leaving it unmounts the timeline, which stops the preview.
const notesMounted = ref(false)
const voiceMounted = ref(false)
watch(
  () => [editor.footerOpen, editor.footerTab] as const,
  ([open, current]) => {
    if (!open) return
    if (current === 'notes') notesMounted.value = true
    else if (current === 'voice') voiceMounted.value = true
  },
  { immediate: true },
)

function onTabClick(id: FooterTab) {
  if (editor.footerOpen && editor.footerTab === id) editor.footerOpen = false
  else editor.openFooter(id)
}

const tabEls = useTemplateRef<HTMLButtonElement[]>('tabEls')
/** Roving tabindex: arrows select (and focus) the neighbouring tab without opening a collapsed bar. */
async function onTabKeydown(e: KeyboardEvent, index: number) {
  const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
  if (!delta) return
  e.preventDefault()
  const next = (index + delta + tabs.length) % tabs.length
  editor.footerTab = tabs[next].id
  await nextTick()
  tabEls.value?.[next]?.focus()
}

// The card is the footer's parent; the body may take at most 60% of it.
const rootEl = useTemplateRef<HTMLElement>('rootEl')
const { height: cardHeight } = useElementSize(() => rootEl.value?.parentElement)
const renderedHeight = computed(() => clampFooterHeight(editor.footerHeight, cardHeight.value))
const maxHeight = computed(() => Math.max(FOOTER_MIN_HEIGHT, Math.floor(cardHeight.value * FOOTER_MAX_RATIO)))
const bodyHeight = computed(() => (editor.footerOpen ? `${renderedHeight.value}px` : '0px'))

const dragging = ref(false)
let startY = 0
let startHeight = 0
function onDragStart(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  startY = e.clientY
  startHeight = renderedHeight.value
  dragging.value = true
}
function onDragMove(e: PointerEvent) {
  if (!dragging.value) return
  editor.footerHeight = clampFooterHeight(startHeight + (startY - e.clientY), cardHeight.value)
}
function onDragEnd() {
  dragging.value = false
}
function onHandleKeydown(e: KeyboardEvent) {
  const to =
    e.key === 'ArrowUp'
      ? renderedHeight.value + FOOTER_KEY_STEP
      : e.key === 'ArrowDown'
        ? renderedHeight.value - FOOTER_KEY_STEP
        : e.key === 'Home'
          ? FOOTER_MIN_HEIGHT
          : e.key === 'End'
            ? maxHeight.value
            : null
  if (to === null) return
  e.preventDefault()
  editor.footerHeight = clampFooterHeight(to, cardHeight.value)
}
</script>

<template>
  <div ref="rootEl" class="relative flex-none rounded-b-panel border-t border-line bg-[#1b1f21]">
    <div
      v-if="editor.footerOpen"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize notes, voice and motion"
      tabindex="0"
      :aria-valuenow="renderedHeight"
      :aria-valuemin="FOOTER_MIN_HEIGHT"
      :aria-valuemax="maxHeight"
      class="group absolute inset-x-0 -top-1.5 z-10 flex h-3 cursor-row-resize items-center justify-center focus-visible:outline-none"
      style="touch-action: none"
      @pointerdown="onDragStart"
      @pointermove="onDragMove"
      @pointerup="onDragEnd"
      @pointercancel="onDragEnd"
      @lostpointercapture="onDragEnd"
      @keydown="onHandleKeydown"
    >
      <span class="h-0.5 w-9 rounded-full bg-line group-hover:bg-muted group-focus-visible:bg-muted" :class="dragging && 'bg-muted'" aria-hidden="true" />
    </div>

    <div class="flex h-10 items-center gap-1 px-4 max-[760px]:px-3">
      <div role="tablist" aria-label="Notes, voice and motion" class="flex items-center gap-1">
        <button
          v-for="(t, i) in tabs"
          :id="`footer-tab-${t.id}`"
          ref="tabEls"
          :key="t.id"
          type="button"
          role="tab"
          aria-controls="footer-panel"
          :aria-selected="editor.footerTab === t.id"
          :tabindex="editor.footerTab === t.id ? 0 : -1"
          class="inline-flex h-7 items-center gap-1.5 rounded-control px-2.5 text-[11px] leading-none hover:bg-white/[0.04] hover:text-white"
          :class="editor.footerTab !== t.id ? 'text-[#919fa7]' : editor.footerOpen ? 'bg-white/[0.07] text-white' : 'text-white'"
          @click="onTabClick(t.id)"
          @keydown="onTabKeydown($event, i)"
        >
          <MessageSquare v-if="t.id === 'notes'" class="size-3.5" aria-hidden="true" />
          <AudioLines v-else-if="t.id === 'voice'" class="size-3.5" aria-hidden="true" />
          <Clapperboard v-else class="size-3.5" aria-hidden="true" />
          {{ t.label }}
        </button>
      </div>
      <button
        type="button"
        class="inline-flex size-7 items-center justify-center rounded-control text-[#919fa7] hover:bg-white/[0.04] hover:text-white"
        :aria-label="editor.footerOpen ? 'Collapse' : 'Expand'"
        :aria-expanded="editor.footerOpen"
        aria-controls="footer-panel"
        @click="editor.footerOpen = !editor.footerOpen"
      >
        <ChevronDown class="size-3.5 transition-transform duration-200" :class="editor.footerOpen && 'rotate-180'" aria-hidden="true" />
      </button>
      <span v-if="editor.footerTab === 'notes'" class="ml-auto text-[10px] leading-none text-[#97a3aa] max-[1279px]:hidden">Only you can see these</span>
    </div>

    <div
      id="footer-panel"
      role="tabpanel"
      :aria-labelledby="`footer-tab-${editor.footerTab}`"
      class="footer-body overflow-y-auto"
      :data-dragging="dragging"
      :style="{ height: bodyHeight }"
      :inert="!editor.footerOpen"
    >
      <div v-if="notesMounted && editor.footerTab === 'notes'" class="px-4 pt-1 pb-3 max-[760px]:px-3">
        <NotesStrip v-if="props.slide" :presentation-id="props.presentationId" :slide="props.slide" />
      </div>
      <div v-if="voiceMounted" v-show="editor.footerTab === 'voice'" data-footer-pane="voice">
        <VoiceTab :presentation-id="props.presentationId" :presentation="props.presentation" :active-slide="props.slide" />
      </div>
      <MotionTimeline v-if="editor.footerTab === 'motion'" :presentation-id="props.presentationId" :slide="props.slide" />
    </div>
  </div>
</template>
