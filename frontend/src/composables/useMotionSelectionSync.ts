import { watch } from 'vue'
import type { SlideAnimationApi } from '@/composables/useSlideAnimation'
import { templateV2ItemSources } from '@/render/legacy/lib/template-v2-json-to-html'
import { ROOT_ELEMENTS_COMPONENT_INDEX, type Selection } from '@/slide-editor/model'
import type { SlideEditing } from '@/slide-editor/useSlideEditing'
import { useEditorStore } from '@/stores/editor'

/**
 * The motion target (`e<i>`, the i-th rendered item) a selection belongs to: a component, or a root
 * element, animates as one unit, so anything selected inside it maps to it. Several components map to none.
 */
export function motionTargetFor(ui: unknown, sel: Selection): string | null {
  if (!sel || sel.kind === 'multi-component') return null
  const root = sel.kind === 'element' && sel.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX
  const source = root
    ? { kind: 'element' as const, index: sel.elementPath[0] }
    : { kind: 'component' as const, index: sel.componentIndex }
  if (source.index === undefined) return null
  const index = templateV2ItemSources(ui).findIndex((s) => s.kind === source.kind && s.index === source.index)
  return index < 0 ? null : `e${index}`
}

/** The on-slide selection of a motion target: its component, or its root element. */
export function selectionForMotionTarget(ui: unknown, id: string): Selection {
  const match = /^e(\d+)$/.exec(id)
  const source = match ? templateV2ItemSources(ui)[Number(match[1])] : undefined
  if (!source) return null
  return source.kind === 'component'
    ? { kind: 'component', componentIndex: source.index }
    : { kind: 'element', componentIndex: ROOT_ELEMENTS_COMPONENT_INDEX, elementPath: [source.index] }
}

/**
 * One selection for the slide and its motion: picking an element on the slide picks its track in the
 * Motion timeline and tab, and picking a track (or the tab's element) selects its element on the slide.
 * The motion preview owns the slide while it runs, so nothing syncs then; when it stops, the picked
 * track's element is selected again. A stale plan names elements the slide no longer has: no sync.
 */
export function useMotionSelectionSync(
  editing: Pick<SlideEditing, 'ui' | 'selection' | 'select'>,
  animation: Pick<SlideAnimationApi, 'animation' | 'stale'>,
) {
  const editor = useEditorStore()
  const synced = () => editor.motionTime === null && !animation.stale.value
  const isTarget = (id: string | null) => !!id && !!animation.animation.value?.targets.some((t) => t.id === id)

  watch(editing.selection, (sel) => {
    if (!synced()) return
    const id = motionTargetFor(editing.ui.value, sel)
    const next = isTarget(id) ? id : null
    if (next !== editor.motionTarget) editor.motionTarget = next
  })

  watch(
    [() => editor.motionTarget, synced],
    ([id, on]) => {
      if (!on || !id || !isTarget(id)) return
      const ui = editing.ui.value
      if (motionTargetFor(ui, editing.selection.value) === id) return
      const sel = selectionForMotionTarget(ui, id)
      if (sel) editing.select(sel)
    },
  )
}
