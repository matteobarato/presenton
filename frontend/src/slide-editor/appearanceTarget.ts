// Where rotation and style (opacity, flip, shadow) are written for the current selection.
// A component with one element keeps rotation on the component and style on its element;
// a group (several elements) takes both on the component.
import {
  getElementAtSelection,
  updateComponentInUi,
  updateElementInUi,
  type ElementSelection,
  type RawUi,
  type Selection,
} from '@/slide-editor/model'
import { dataRoot } from '@/slide-editor/dataRoot'
import { normalizeRotation } from '@/slide-editor/elementStyle'

type Rec = Record<string, unknown>
export type ComponentTarget = { kind: 'component'; componentIndex: number }
export type AppearanceTarget = ComponentTarget | ElementSelection
export type AppearanceTargets = { rotation: AppearanceTarget; style: AppearanceTarget }

export function appearanceTargets(ui: RawUi, sel: Selection): AppearanceTargets | null {
  if (!sel || sel.kind === 'multi-component') return null
  if (sel.kind === 'element') return { rotation: sel, style: sel }
  const component = (Array.isArray(ui.components) ? ui.components : [])[sel.componentIndex] as Rec | undefined
  if (!component) return null
  const rotation: ComponentTarget = { kind: 'component', componentIndex: sel.componentIndex }
  const root = dataRoot(ui, sel, 'infographic') ?? dataRoot(ui, sel, 'layout')
  if (root) return { rotation, style: root }
  const single = Array.isArray(component.elements) && component.elements.length === 1
  return { rotation, style: single ? { kind: 'element', componentIndex: sel.componentIndex, elementPath: [0] } : rotation }
}

function recordAt(ui: RawUi, target: AppearanceTarget): Rec | null {
  if (target.kind === 'element') return getElementAtSelection(ui, target) as Rec | null
  const component = (Array.isArray(ui.components) ? ui.components : [])[target.componentIndex]
  return component && typeof component === 'object' ? (component as Rec) : null
}

export const readTarget = recordAt

export function readRotation(ui: RawUi, target: AppearanceTarget): number {
  const r = recordAt(ui, target)?.rotation
  return typeof r === 'number' && Number.isFinite(r) ? r : 0
}

export function patchAppearanceInUi(ui: RawUi, target: AppearanceTarget, fn: (record: Rec) => Rec): RawUi {
  return target.kind === 'element'
    ? updateElementInUi(ui, target, fn)
    : updateComponentInUi(ui, target.componentIndex, fn)
}

export function setRotationInUi(ui: RawUi, target: AppearanceTarget, deg: number): RawUi {
  return patchAppearanceInUi(ui, target, (record) => ({ ...record, rotation: normalizeRotation(deg) }))
}

