import {
  computed,
  inject,
  onScopeDispose,
  provide,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from 'vue'
import type { Slide } from '@/api/types'
import { slideKind } from '@/render/slide-kind'
import { useSlideMutations } from '@/composables/useSlideMutations'
import { useEditorStore } from '@/stores/editor'
import {
  ROOT_ELEMENTS_COMPONENT_INDEX,
  getElementAtSelection,
  type AlignmentGuide,
  type ElementSelection,
  type RawElement,
  type RawUi,
  type Selection,
} from '@/slide-editor/model'

export interface SlideEditing {
  enabled: ComputedRef<boolean>
  /** Id of the slide this state belongs to. */
  slideId: ComputedRef<string | null>
  ui: ComputedRef<RawUi | null>
  selection: Ref<Selection>
  draftUi: Ref<RawUi | null>
  inlineEdit: Ref<{ selection: ElementSelection; element: RawElement } | null>
  guides: Ref<AlignmentGuide[]>
  select: (sel: Selection) => void
  commit: (next: RawUi, label: string) => Promise<boolean>
  cancelDraft: () => void
}

export const SLIDE_EDITING_KEY: InjectionKey<SlideEditing> = Symbol('slide-editing')

export function useSlideEditingContext(): SlideEditing {
  const api = inject(SLIDE_EDITING_KEY, null)
  if (!api) throw new Error('useSlideEditingContext requires a useSlideEditing provider')
  return api
}

function componentExists(ui: RawUi, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && Array.isArray(ui.components) && index < ui.components.length
}

function selectionValid(ui: RawUi | null, sel: Selection): boolean {
  if (!sel) return true
  if (!ui) return false
  if (sel.kind === 'component') return componentExists(ui, sel.componentIndex)
  if (sel.kind === 'multi-component') return sel.componentIndexes.every((i) => componentExists(ui, i))
  if (sel.componentIndex !== ROOT_ELEMENTS_COMPONENT_INDEX && !componentExists(ui, sel.componentIndex)) return false
  return getElementAtSelection(ui, sel) != null
}

/** On-slide editing state for one slide; provided to descendants. */
export function useSlideEditing(presentationId: Ref<string>, slide: Ref<Slide | null>): SlideEditing {
  const editor = useEditorStore()
  const { editSlideUi } = useSlideMutations(presentationId)

  const selection = ref<Selection>(null)
  const draftUi = shallowRef<RawUi | null>(null)
  const inlineEdit = ref<{ selection: ElementSelection; element: RawElement } | null>(null)
  const guides = ref<AlignmentGuide[]>([])

  const slideId = computed(() => slide.value?.id ?? null)
  const enabled = computed(() => !!slide.value && slideKind(slide.value) === 'template' && !editor.locked)
  const ui = computed<RawUi | null>(() => draftUi.value ?? ((slide.value?.ui as RawUi | null | undefined) ?? null))

  function select(sel: Selection) {
    selection.value = sel
  }

  function cancelDraft() {
    draftUi.value = null
    guides.value = []
  }

  // The draft holds `next` until the committed ui reaches the slide (the ui watcher drops it),
  // so the slide never snaps back to the old ui while the cache write propagates.
  async function commit(next: RawUi, label: string): Promise<boolean> {
    const id = slide.value?.id
    guides.value = []
    if (!id) {
      draftUi.value = null
      return false
    }
    const unchanged = JSON.stringify(slide.value?.ui ?? null) === JSON.stringify(next)
    draftUi.value = unchanged ? null : next
    const ok = await editSlideUi(id, next, label)
    if (!ok && draftUi.value === next) cancelDraft()
    return ok
  }

  watch(
    () => slide.value?.id,
    () => {
      selection.value = null
      inlineEdit.value = null
      cancelDraft()
    },
  )

  // An external change to the committed ui (undo, AI edit, refetch) invalidates what depended on the old one.
  watch(
    () => slide.value?.ui,
    (committed) => {
      inlineEdit.value = null
      draftUi.value = null
      if (!selectionValid((committed as RawUi | null | undefined) ?? null, selection.value)) selection.value = null
    },
  )

  watch(enabled, (on) => {
    if (on) return
    selection.value = null
    inlineEdit.value = null
    cancelDraft()
  })

  watch(
    () => selection.value !== null,
    (active) => {
      editor.slideSelectionActive = active
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    editor.slideSelectionActive = false
  })

  const api: SlideEditing = { enabled, slideId, ui, selection, draftUi, inlineEdit, guides, select, commit, cancelDraft }
  provide(SLIDE_EDITING_KEY, api)
  return api
}
