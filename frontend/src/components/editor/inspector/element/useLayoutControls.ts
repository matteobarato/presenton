import { computed } from 'vue'
import type { Presentation } from '@/api/types'
import { dataRoot } from '@/slide-editor/dataRoot'
import {
  addLayoutItem,
  alignmentChanges,
  applyLayoutChanges,
  fillChanges,
  gapChanges,
  layoutType,
  paddingChanges,
  radiusChanges,
  readContainer,
  readGap,
  removeLastLayoutItem,
  strokeChanges,
  type Horizontal,
  type Vertical,
} from '@/slide-editor/layoutOps'
import {
  absoluteBoxForSelection,
  getElementAtSelection,
  layoutItemStats,
  type ElementSelection,
  type RawElement,
  type RawUi,
} from '@/slide-editor/model'
import { themePalette } from '@/slide-editor/themePalette'
import { useEditingActions } from '@/slide-editor/useEditingActions'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

/** Layout (flex/grid/container) state and edits, shared by the Layout inspector section and the floating bar's quick controls. */
export function useLayoutControls(presentation: () => Presentation) {
  const ctx = useSlideEditingContext()
  const actions = useEditingActions(ctx)
  const palette = computed(() => themePalette(presentation()))

  /** The layout (it can sit inside a selected component). */
  const root = computed<ElementSelection | null>(() => dataRoot(ctx.ui.value, ctx.selection.value, 'layout'))
  const raw = computed<RawElement | null>(() => (ctx.ui.value && root.value ? getElementAtSelection(ctx.ui.value, root.value) : null))
  const type = computed(() => layoutType(raw.value))
  const isContainer = computed(() => type.value === 'container')
  const gap = computed(() => (raw.value ? readGap(raw.value) : 0))
  const stats = computed(() => (raw.value ? layoutItemStats(raw.value) : null))
  const box = computed(() => (ctx.ui.value && root.value ? absoluteBoxForSelection(ctx.ui.value, root.value) : null))
  const container = computed(() => (raw.value && isContainer.value ? readContainer(raw.value, box.value ?? { width: 0, height: 0 }) : null))

  // Anchor: the layout root when a colour popover opened, a field took focus or an alignment button was pressed,
  // so a deferred commit lands there. A number field commits on blur, after a canvas click has already moved the
  // selection (see AppearanceSection.vue).
  let anchor: ElementSelection | null = null
  const hold = () => (anchor = root.value)
  const release = () => (anchor = null)
  function target(): ElementSelection | null {
    const at = anchor ?? root.value
    anchor = null
    return at
  }

  function run(name: string, fn: (ui: RawUi, at: ElementSelection) => RawUi | null, at: ElementSelection | null = root.value) {
    if (!at) return
    void actions.run(name, (ui) => {
      const next = fn(ui, at)
      return next ? { ui: next, selection: ctx.selection.value } : null
    })
  }
  function change(name: string, build: (el: RawElement, ui: RawUi, at: ElementSelection) => Record<string, unknown>, at: ElementSelection | null) {
    run(name, (ui, r) => {
      const el = getElementAtSelection(ui, r)
      return el ? applyLayoutChanges(ui, r, build(el, ui, r)) : null
    }, at)
  }
  /** The corner radius cap of the container at `at` (the anchored one, not the current selection). */
  function maxRadiusAt(el: RawElement, ui: RawUi, at: ElementSelection): number {
    return readContainer(el, absoluteBoxForSelection(ui, at) ?? { width: 0, height: 0 }).maxRadius
  }

  const setGap = (v: number) => {
    const at = target()
    if (Number.isFinite(v)) change('Gap', () => gapChanges(v), at)
  }
  const addItem = () => run('Add item', addLayoutItem)
  const removeItem = () => run('Remove item', removeLastLayoutItem)
  const fillColour = (c: string | null) => c && change('Fill', (el) => fillChanges(el, { color: c }), target())
  const fillOpacity = (p: number) => change('Fill', (el) => fillChanges(el, { opacity: p / 100 }), target())
  const strokeColour = (c: string | null) => c && change('Stroke', (el) => strokeChanges(el, { color: c }), target())
  const strokeWidth = (w: number) => change('Stroke', (el) => strokeChanges(el, { width: w }), target())
  const strokeOpacity = (p: number) => change('Stroke', (el) => strokeChanges(el, { opacity: p / 100 }), target())
  const setRadius = (v: number) => change('Corner radius', (el, ui, at) => radiusChanges(v, maxRadiusAt(el, ui, at)), target())
  const align = (h: Horizontal, v: Vertical) => change('Alignment', (el) => alignmentChanges(el, h, v), target())
  const setPadding = (axis: 'x' | 'y', v: number) => change('Padding', (el) => paddingChanges(el, axis, v), target())

  return {
    palette,
    raw,
    type,
    isContainer,
    gap,
    stats,
    container,
    hold,
    release,
    setGap,
    addItem,
    removeItem,
    fillColour,
    fillOpacity,
    strokeColour,
    strokeWidth,
    strokeOpacity,
    setRadius,
    align,
    setPadding,
  }
}
