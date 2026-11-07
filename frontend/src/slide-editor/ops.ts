import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  childArrayInfo,
  componentBox,
  componentForClipboardSelection,
  componentIndexesForSelection,
  createTemplateV2ClipboardPayload,
  deleteSelectionFromUi,
  elementBox,
  groupTemplateV2ComponentsInUi,
  layoutChildren,
  pasteTemplateV2ClipboardPayload,
  readArray,
  selectionForComponentIndexes,
  setComponentPositionsInUi,
  ungroupTemplateV2ComponentInUi,
  canUngroupTemplateV2Component,
  type RawUi,
  type Selection,
  type TemplateV2ClipboardPayload,
} from '@/slide-editor/model'

export type OpResult = { ui: RawUi; selection: Selection } | null

export const PASTE_OFFSET = 16

export function clipboardPayloadForSelection(ui: RawUi, sel: Selection): TemplateV2ClipboardPayload | null {
  const source = componentForClipboardSelection(ui, sel)
  if (!source) return null
  return createTemplateV2ClipboardPayload(
    source.components.map(({ component, box }) => ({ data: component, absoluteBox: box })),
  )
}

export function deleteSelection(ui: RawUi, sel: Selection): OpResult {
  if (!sel) return null
  const next = deleteSelectionFromUi(ui, sel)
  if (next === ui) return null
  return { ui: next, selection: null }
}

export function pasteFromPayload(ui: RawUi, payload: TemplateV2ClipboardPayload, offset = PASTE_OFFSET): OpResult {
  const result = pasteTemplateV2ClipboardPayload({ sourceUi: ui, payload, offset })
  return result ? { ui: result.ui, selection: result.selection } : null
}

export function duplicateSelection(ui: RawUi, sel: Selection): OpResult {
  const payload = clipboardPayloadForSelection(ui, sel)
  return payload ? pasteFromPayload(ui, payload) : null
}

export function groupSelection(ui: RawUi, sel: Selection): OpResult {
  if (sel?.kind !== 'multi-component') return null
  const result = groupTemplateV2ComponentsInUi(ui, sel.componentIndexes, { componentBox })
  if (!result) return null
  // The group is appended; groupTemplateV2ComponentsInUi selects it.
  return { ui: result.ui as RawUi, selection: result.selection }
}

export function ungroupSelection(ui: RawUi, sel: Selection): OpResult {
  if (sel?.kind !== 'component') return null
  const component = readArray(ui.components)[sel.componentIndex] as Record<string, unknown> | undefined
  if (!canUngroupTemplateV2Component(component)) return null
  const result = ungroupTemplateV2ComponentInUi(ui, sel.componentIndex, {
    childArrayInfo,
    componentBox,
    elementBox,
    layoutChildren,
  })
  if (!result) return null
  return { ui: result.ui as RawUi, selection: result.selection }
}

/** Moves the selected components by (dx, dy) slide px, keeping their union box inside the slide. */
export function nudge(ui: RawUi, sel: Selection, dx: number, dy: number): OpResult {
  const indexes = componentIndexesForSelection(sel)
  if (indexes.length === 0) return null
  const entries = indexes.flatMap((componentIndex) => {
    const component = readArray(ui.components)[componentIndex] as Record<string, unknown> | undefined
    return component ? [{ componentIndex, box: componentBox(component) }] : []
  })
  if (entries.length === 0) return null
  const left = Math.min(...entries.map((e) => e.box.x))
  const top = Math.min(...entries.map((e) => e.box.y))
  const right = Math.max(...entries.map((e) => e.box.x + e.box.width))
  const bottom = Math.max(...entries.map((e) => e.box.y + e.box.height))
  // `before` / `after` are the free space on each side of the union box.
  const clampAxis = (d: number, before: number, after: number) => Math.min(Math.max(d, -before), Math.max(-before, after))
  const mx = clampAxis(dx, left, STAGE_WIDTH - right)
  const my = clampAxis(dy, top, STAGE_HEIGHT - bottom)
  if (mx === 0 && my === 0) return null
  const next = setComponentPositionsInUi(
    ui,
    entries.map(({ componentIndex, box }) => ({ componentIndex, position: { x: box.x + mx, y: box.y + my } })),
  )
  if (next === ui) return null
  return { ui: next, selection: selectionForComponentIndexes(indexes) }
}
