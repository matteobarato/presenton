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
  type ShallowRef,
} from 'vue'
import type { Editor } from '@tiptap/vue-3'
import type { Slide } from '@/api/types'
import { slideKind } from '@/render/slide-kind'
import { useSlideMutations } from '@/composables/useSlideMutations'
import { useEditorStore } from '@/stores/editor'
import {
  ROOT_ELEMENTS_COMPONENT_INDEX,
  getElementAtSelection,
  type AlignmentGuide,
  type ElementSelection,
  type RawUi,
  type Selection,
} from '@/slide-editor/model'
import { inlineEditUi, startInlineEdit, type InlineEditSession } from '@/slide-editor/tiptapRuns'

export interface SlideEditing {
  enabled: ComputedRef<boolean>
  /** Id of the slide this state belongs to. */
  slideId: ComputedRef<string | null>
  ui: ComputedRef<RawUi | null>
  selection: Ref<Selection>
  draftUi: Ref<RawUi | null>
  /** The open inline text edit; its slideId is the slide it commits to. */
  inlineEdit: Ref<InlineEditSession | null>
  /** The open inline editor's Tiptap instance (set by InlineTextEditor), for toolbar commands. */
  inlineEditor: ShallowRef<Editor | null>
  guides: Ref<AlignmentGuide[]>
  select: (sel: Selection) => void
  commit: (next: RawUi, label: string) => Promise<boolean>
  /** Commits `next` to the slide with this id (the current slide or one just left). */
  commitTo: (slideId: string, next: RawUi, label: string) => Promise<boolean>
  cancelDraft: () => void
  /** Opens the inline text editor for a text or text-list element. */
  requestInlineEdit: (sel: ElementSelection) => void
  /** Closes the inline editor; with `commit`, its text goes to the slide it was opened on. */
  closeInlineEdit: (commit: boolean) => Promise<boolean>
}

export const SLIDE_EDITING_KEY: InjectionKey<SlideEditing> = Symbol('slide-editing')

export function useSlideEditingContext(): SlideEditing {
  const api = inject(SLIDE_EDITING_KEY, null)
  if (!api) throw new Error('useSlideEditingContext requires a useSlideEditing provider')
  return api
}

/** Like useSlideEditingContext, but null outside an editing provider. */
export function useSlideEditingContextOptional(): SlideEditing | null {
  return inject(SLIDE_EDITING_KEY, null)
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
  const inlineEdit = shallowRef<InlineEditSession | null>(null)
  const inlineEditor = shallowRef<Editor | null>(null)
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
    return commitTo(id, next, label)
  }

  // A commit for a slide that is no longer current skips the draft: the draft belongs to the current slide.
  async function commitTo(id: string, next: RawUi, label: string): Promise<boolean> {
    const current = id === slide.value?.id
    if (current) {
      guides.value = []
      const unchanged = JSON.stringify(slide.value?.ui ?? null) === JSON.stringify(next)
      draftUi.value = unchanged ? null : next
    }
    const entry = { slideId: id, ui: next }
    pending.push(entry)
    try {
      const ok = await editSlideUi(id, next, label)
      if (current && !ok && draftUi.value === next) cancelDraft()
      return ok
    } finally {
      pending.splice(pending.indexOf(entry), 1)
    }
  }

  // Uis this context committed whose save is still in flight. The cache write can land well after the
  // commit (applyEdit may wait for a refetch), and its arrival is not an external change.
  const pending: { slideId: string; ui: RawUi }[] = []
  function pendingIndex(id: string | undefined, committed: unknown): number {
    if (!id || pending.length === 0) return -1
    const byRef = pending.findIndex((p) => p.slideId === id && p.ui === committed)
    if (byRef >= 0) return byRef
    const json = JSON.stringify(committed ?? null)
    return pending.findIndex((p) => p.slideId === id && JSON.stringify(p.ui) === json)
  }

  function dropInlineEdit() {
    inlineEdit.value = null
    inlineEditor.value = null
  }

  function closeInlineEdit(commitEdit: boolean): Promise<boolean> {
    const edit = inlineEdit.value
    const tiptap = inlineEditor.value
    dropInlineEdit()
    if (!edit || !commitEdit || !tiptap || tiptap.isDestroyed) return Promise.resolve(false)
    const next = inlineEditUi(edit, tiptap.getJSON())
    return next ? commitTo(edit.slideId, next, 'Edit text') : Promise.resolve(false)
  }

  function requestInlineEdit(sel: ElementSelection) {
    if (inlineEdit.value) void closeInlineEdit(true)
    const id = slide.value?.id
    const u = ui.value
    if (!enabled.value || !id || !u) return
    const edit = startInlineEdit(u, sel, id)
    if (!edit) return
    selection.value = sel
    inlineEdit.value = edit
  }

  // Typed text is committed to the slide it was typed on before anything is cleared for the next one;
  // sync, so it runs before the watchers below see the new slide.
  watch(
    () => slide.value?.id,
    () => void closeInlineEdit(true),
    { flush: 'sync' },
  )

  watch(
    () => slide.value?.id,
    () => {
      selection.value = null
      dropInlineEdit()
      cancelDraft()
    },
  )

  // An external change to the committed ui (undo, AI edit, refetch) invalidates what depended on the old one.
  watch(
    () => slide.value?.ui,
    (committed) => {
      const own = pendingIndex(slide.value?.id, committed)
      if (own >= 0) {
        // Our own commit landed: the open edit and any newer draft still stand. The draft goes only
        // when it is this ui (or an older one), never when a later commit is still on its way.
        const draft = draftUi.value
        const draftIndex = draft ? pending.findIndex((p) => p.ui === draft) : -1
        if (draftIndex <= own) draftUi.value = null
      } else {
        dropInlineEdit()
        draftUi.value = null
      }
      if (!selectionValid((committed as RawUi | null | undefined) ?? null, selection.value)) selection.value = null
    },
  )

  watch(enabled, (on) => {
    if (on) return
    selection.value = null
    dropInlineEdit()
    cancelDraft()
  })

  // Selecting anything else closes the editor (and keeps its text).
  watch(selection, (sel) => {
    const edit = inlineEdit.value
    if (edit && JSON.stringify(sel) !== JSON.stringify(edit.selection)) void closeInlineEdit(true)
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
    void closeInlineEdit(true)
  })

  const api: SlideEditing = {
    enabled,
    slideId,
    ui,
    selection,
    draftUi,
    inlineEdit,
    inlineEditor,
    guides,
    select,
    commit,
    commitTo,
    cancelDraft,
    requestInlineEdit,
    closeInlineEdit,
  }
  provide(SLIDE_EDITING_KEY, api)
  return api
}
