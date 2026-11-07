import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type InspectorTabId = 'design' | 'narration'

/** Stable key of a slide; slides mid-stream may not have an id yet. */
export const slideKey = (s: { id?: string | null; index: number }) => s.id ?? `index-${s.index}`

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 2

/**
 * UI state of the editor. Slide content lives in the Query cache, never here;
 * only the ordered slide ids are mirrored (by EditorView) so next()/prev() can
 * navigate without reading the cache.
 */
export const useEditorStore = defineStore('editor', () => {
  const activeSlideId = ref<string | null>(null)
  const slideIds = ref<string[]>([])
  // True while the deck is being generated: structural edits are off.
  const generating = ref(false)
  // Raised for a whole chat/Ask turn (and its refetch): the AI may rewrite slides, so structural edits wait.
  const deckBusy = ref(0)
  /** Structural edits (and anything that PATCHes the deck's slides) are off. */
  const locked = computed(() => generating.value || deckBusy.value > 0)
  const navigatorOpen = ref(false) // the drawer, below 760px
  const navigatorVisible = ref(true) // the docked storyboard, above 760px
  const inspectorOpen = ref(true)
  const chatOpen = ref(false)
  const inspectorTab = ref<InspectorTabId>('design')
  const zoom = ref(1)
  const notesOpen = ref(false)
  const exportOpen = ref(false)
  // Bumped by Cmd/Ctrl+Enter; the navigator opens its layout picker.
  const addSlideRequested = ref(0)

  /** Ask AI has its own panel, docked right of the inspector (a drawer on narrow screens). */
  function openAsk() {
    chatOpen.value = true
  }
  function toggleAsk() {
    chatOpen.value = !chatOpen.value
  }

  function select(id: string | null) {
    activeSlideId.value = id
  }

  function step(delta: number) {
    const ids = slideIds.value
    if (!ids.length) return
    const current = ids.indexOf(activeSlideId.value ?? '')
    const target = Math.min(ids.length - 1, Math.max(0, (current < 0 ? 0 : current) + delta))
    activeSlideId.value = ids[target]!
  }
  const next = () => step(1)
  const prev = () => step(-1)

  function setZoom(value: number) {
    zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100))
  }

  function reset() {
    activeSlideId.value = null
    slideIds.value = []
    zoom.value = 1
    exportOpen.value = false
    deckBusy.value = 0
  }

  return {
    activeSlideId,
    slideIds,
    generating,
    deckBusy,
    locked,
    navigatorOpen,
    inspectorOpen,
    inspectorTab,
    zoom,
    notesOpen,
    navigatorVisible,
    exportOpen,
    addSlideRequested,
    openAsk,
    toggleAsk,
    chatOpen,
    select,
    next,
    prev,
    setZoom,
    reset,
  }
})
