import type { EditorInsertContent } from '@/slide-editor/insert/insert-elements'
import {
  appendInsertedContent,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  ROOT_ELEMENTS_COMPONENT_INDEX,
  absoluteBoxForSelection,
  childArrayInfo,
  componentBox,
  componentForClipboardSelection,
  componentIndexesForSelection,
  createTemplateV2ClipboardPayload,
  deleteSelectionFromUi,
  getElementAtSelection,
  elementBox,
  isVectorType,
  localElementBox,
  rootElementsComponent,
  translateVectorElement,
  updateElementInUi,
  type ElementSelection,
  groupTemplateV2ComponentsInUi,
  layoutChildren,
  pasteTemplateV2ClipboardPayload,
  readArray,
  selectionForComponentIndexes,
  setComponentPositionsInUi,
  ungroupTemplateV2ComponentInUi,
  withUpdatedChildItems,
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

/** True when the element's parent layout (flex/grid/container) controls its position. */
export function isLayoutManagedElement(ui: RawUi, sel: ElementSelection): boolean {
  const path = sel.elementPath
  if (path.length < 2) return false
  const component =
    sel.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX
      ? rootElementsComponent(ui)
      : (readArray(ui.components)[sel.componentIndex] as Record<string, unknown> | undefined)
  if (!component) return true
  const parentPath = path.slice(0, -1)
  const parentBox = localElementBox(component, parentPath)
  const parent = getElementAtSelection(ui, { ...sel, elementPath: parentPath })
  const info = parent ? childArrayInfo(parent) : null
  if (!parent || !info || !parentBox) return true
  const index = path[path.length - 1]!
  const laidOut = layoutChildren(parent, info.items, { x: 0, y: 0, width: parentBox.width, height: parentBox.height })
  return laidOut.find((item) => item.index === index)?.layoutManaged ?? false
}

function nudgeElement(ui: RawUi, sel: ElementSelection, dx: number, dy: number): OpResult {
  const element = getElementAtSelection(ui, sel)
  const box = absoluteBoxForSelection(ui, sel)
  if (!element || !box || isLayoutManagedElement(ui, sel)) return null
  const mx = Math.min(Math.max(dx, -box.x), Math.max(-box.x, STAGE_WIDTH - (box.x + box.width)))
  const my = Math.min(Math.max(dy, -box.y), Math.max(-box.y, STAGE_HEIGHT - (box.y + box.height)))
  if (mx === 0 && my === 0) return null
  const next = updateElementInUi(ui, sel, (current) =>
    isVectorType(typeof current.type === 'string' ? current.type : null)
      ? translateVectorElement(current, { x: mx, y: my })
      : {
          ...current,
          position: {
            x: (Number(current.position?.x) || 0) + mx,
            y: (Number(current.position?.y) || 0) + my,
          },
        },
  )
  return next === ui ? null : { ui: next, selection: sel }
}

/** Moves the selection by (dx, dy) slide px, keeping it inside the slide. Layout-managed elements do not move. */
export function nudge(ui: RawUi, sel: Selection, dx: number, dy: number): OpResult {
  if (sel?.kind === 'element') return nudgeElement(ui, sel, dx, dy)
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

export type LayerAction = 'bring-to-front' | 'bring-forward' | 'send-backward' | 'send-to-back'

function moveItem<T>(items: readonly T[], from: number, action: LayerAction): { items: T[]; index: number } | null {
  const last = items.length - 1
  if (from < 0 || from > last || last < 1) return null
  const to =
    action === 'bring-to-front' ? last : action === 'send-to-back' ? 0 : action === 'bring-forward' ? from + 1 : from - 1
  if (to < 0 || to > last || to === from) return null
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return { items: next, index: to }
}

/**
 * Moves the selection one layer up or down, or to the top or bottom, among its siblings: later
 * siblings paint on top. A component moves within the slide's components; an element moves within
 * its parent's children, unless the parent lays it out (flex/grid), where order is position. The
 * lone element of a component moves its component.
 */
export function reorderSelection(ui: RawUi, sel: Selection, action: LayerAction): OpResult {
  if (!sel || sel.kind === 'multi-component') return null
  const components = readArray(ui.components)
  const moveComponent = (componentIndex: number, toSelection: (index: number) => Selection): OpResult => {
    const moved = moveItem(components, componentIndex, action)
    return moved ? { ui: { ...ui, components: moved.items }, selection: toSelection(moved.index) } : null
  }
  if (sel.kind === 'component') {
    return moveComponent(sel.componentIndex, (componentIndex) => ({ kind: 'component', componentIndex }))
  }

  const path = sel.elementPath
  const index = path[path.length - 1]
  if (index === undefined) return null
  const withIndex = (i: number): Selection => ({ ...sel, elementPath: [...path.slice(0, -1), i] })

  if (path.length === 1) {
    if (sel.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX) {
      const moved = moveItem(readArray(ui.elements), index, action)
      return moved ? { ui: { ...ui, elements: moved.items }, selection: withIndex(moved.index) } : null
    }
    const component = components[sel.componentIndex] as Record<string, unknown> | undefined
    const elements = readArray(component?.elements)
    if (!component || elements.length === 0) return null
    if (elements.length === 1) {
      return moveComponent(sel.componentIndex, (componentIndex) => ({ ...sel, componentIndex }))
    }
    const moved = moveItem(elements, index, action)
    if (!moved) return null
    const nextComponents = [...components]
    nextComponents[sel.componentIndex] = { ...component, elements: moved.items }
    return { ui: { ...ui, components: nextComponents }, selection: withIndex(moved.index) }
  }

  if (isLayoutManagedElement(ui, sel)) return null
  const parentSel: ElementSelection = { ...sel, elementPath: path.slice(0, -1) }
  const parent = getElementAtSelection(ui, parentSel)
  const info = parent ? childArrayInfo(parent) : null
  if (!parent || !info || info.key === 'child') return null
  const moved = moveItem(info.items, index, action)
  if (!moved) return null
  const next = updateElementInUi(ui, parentSel, (current) => withUpdatedChildItems(current, info, moved.items))
  return next === ui ? null : { ui: next, selection: withIndex(moved.index) }
}

export type InsertRequest =
  | { content: EditorInsertContent; label: string }
  | { block: Record<string, unknown>; label: string }

const CASCADE_NEAR = 2
const CASCADE_MAX_STEPS = 20

/** A template block as a slide component: without its sibling variants or the group's size. */
function insertableBlock(block: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...block }
  delete rest.variants
  delete rest.size
  return rest
}

export function insertContent(ui: RawUi, req: InsertRequest): OpResult {
  const before = readArray(ui.components)
  const appended =
    'block' in req
      ? appendInsertedContent(ui, [], [insertableBlock(req.block)], req.label, true)
      : appendInsertedContent(ui, req.content.elements ?? [], req.content.components ?? [], req.label, false)
  const components = [...readArray(appended.components)]
  if (components.length <= before.length) return null

  const isNear = (a: ReturnType<typeof componentBox>, b: ReturnType<typeof componentBox>) =>
    Math.abs(a.x - b.x) <= CASCADE_NEAR && Math.abs(a.y - b.y) <= CASCADE_NEAR
  const newIndexes = components.slice(before.length).map((_, i) => before.length + i)
  const existingBoxes = before.map((component) => componentBox(component as never))
  const collides = () =>
    newIndexes.some((i) => {
      const box = componentBox(components[i] as never)
      return existingBoxes.some((existing) => isNear(existing, box))
    })

  for (let step = 0; step < CASCADE_MAX_STEPS && collides(); step += 1) {
    for (const i of newIndexes) {
      const component = components[i] as { position?: { x?: number; y?: number } }
      components[i] = {
        ...component,
        position: {
          ...component.position,
          x: (component.position?.x ?? 0) + PASTE_OFFSET,
          y: (component.position?.y ?? 0) + PASTE_OFFSET,
        },
      } as never
    }
  }

  return { ui: { ...appended, components }, selection: selectionForComponentIndexes(newIndexes) }
}
