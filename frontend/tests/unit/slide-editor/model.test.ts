import { describe, expect, it } from 'vitest'
import {
  absoluteBoxForSelection,
  resizeComponentFrame,
  componentBox,
  createTemplateV2ClipboardPayload,
  deleteSelectionFromUi,
  elementBox,
  groupTemplateV2ComponentsInUi,
  childArrayInfo,
  layoutChildren,
  pasteTemplateV2ClipboardPayload,
  resizeComponent,
  setComponentPositionsInUi,
  ungroupTemplateV2ComponentInUi,
  type RawComponent,
  type RawUi,
} from '@/slide-editor/model'
import { uiTwoComponents, uiWithText, uiWithVideoPlaceholder } from './fixtures'

type Loose = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const components = (ui: RawUi) => ui.components as RawComponent[]
const withCustomX = (ui: RawUi, index: number): RawUi => ({
  ...ui,
  components: components(ui).map((c, i) => (i === index ? { ...c, customX: 1 } : c)),
})

describe('slide-editor model', () => {
  it('computes the absolute box of a component selection', () => {
    expect(absoluteBoxForSelection(uiWithText(), { kind: 'component', componentIndex: 0 })).toEqual({
      x: 100, y: 80, width: 400, height: 120,
    })
  })

  it('moves one component without mutating the input', () => {
    const ui = uiTwoComponents()
    const before = structuredClone(ui)
    const next = setComponentPositionsInUi(ui, [{ componentIndex: 0, position: { x: 150, y: 90 } }])
    expect(ui).toEqual(before)
    expect(components(next)[0].position).toEqual({ x: 150, y: 90 })
    expect(components(next)[1]).toEqual(components(before)[1])
    expect({ ...components(next)[0], position: null }).toEqual({ ...components(before)[0], position: null })
  })

  it('deletes a component selection', () => {
    const next = deleteSelectionFromUi(uiTwoComponents(), { kind: 'component', componentIndex: 1 })
    expect(components(next)).toHaveLength(1)
  })

  it('resizeComponent doubles the box (font scales by sqrt(sx*sy), as in the old editor); frame resize leaves fonts alone', () => {
    const source = components(uiWithText())[0]
    const next = resizeComponent(source, { x: 100, y: 80, width: 800, height: 240, scaleX: 2, scaleY: 2 })
    expect(componentBox(next as RawComponent)).toMatchObject({ width: 800, height: 240 })
    const el = ((next as Loose).elements as Loose[])[0]
    expect(el.font.size).toBe(48)
    const framed = resizeComponentFrame(source, { x: 100, y: 80, width: 800, height: 240 })
    expect(((framed as Loose).elements as Loose[])[0].font.size).toBe(24)
  })

  it('copy/paste adds an offset component with a new id', () => {
    const ui = uiWithText()
    const payload = createTemplateV2ClipboardPayload([
      { data: components(ui)[0], absoluteBox: { x: 100, y: 80, width: 400, height: 120 } },
    ])
    const result = pasteTemplateV2ClipboardPayload({ sourceUi: ui, payload, offset: 24 })
    expect(result).not.toBeNull()
    const list = components(result!.ui as RawUi)
    expect(list).toHaveLength(2)
    expect(list[1].position).not.toEqual(list[0].position)
    expect(list[1].id).not.toBe(list[0].id)
  })

  it('group then ungroup restores the absolute boxes', () => {
    const ui = uiTwoComponents()
    const boxes = components(ui).map((c) => componentBox(c))
    const grouped = groupTemplateV2ComponentsInUi(ui, [0, 1], { componentBox })
    expect(grouped).not.toBeNull()
    expect(components(grouped!.ui as RawUi)).toHaveLength(1)
    const ungrouped = ungroupTemplateV2ComponentInUi(grouped!.ui, grouped!.selection.componentIndex, {
      childArrayInfo: childArrayInfo as never,
      componentBox: componentBox as never,
      elementBox: elementBox as never,
      layoutChildren: layoutChildren as never,
    })
    expect(ungrouped).not.toBeNull()
    const out = components(ungrouped!.ui as RawUi)
    expect(out).toHaveLength(2)
    const outBoxes = out.map((c) => componentBox(c))
    for (const box of boxes) {
      const match = outBoxes.find((b) => Math.abs(b.x - box.x) <= 1 && Math.abs(b.y - box.y) <= 1)
      expect(match).toBeTruthy()
      expect(Math.abs(match!.width - box.width)).toBeLessThanOrEqual(1)
      expect(Math.abs(match!.height - box.height)).toBeLessThanOrEqual(1)
    }
  })

  it('keeps unknown component fields through move, resize and group/ungroup', () => {
    const ui = withCustomX(uiTwoComponents(), 0)
    const moved = setComponentPositionsInUi(ui, [{ componentIndex: 0, position: { x: 150, y: 90 } }])
    expect(components(moved)[0].customX).toBe(1)
    const resized = resizeComponent(components(ui)[0], { x: 100, y: 80, width: 800, height: 240, scaleX: 2, scaleY: 2 })
    expect((resized as Loose).customX).toBe(1)
    // The old group/ungroup rebuilds grouped components from a whitelist, so an
    // unknown field survives only on components outside the group (ported as-is).
    const three = { ...ui, customRoot: 1, components: [...components(ui), { ...components(ui)[1], id: 'c-extra', customX: 2 }] } as RawUi
    const grouped = groupTemplateV2ComponentsInUi(three, [0, 1], { componentBox })!
    const out = grouped.ui as RawUi & { customRoot: number }
    expect(out.customRoot).toBe(1)
    expect(components(out).find((c) => c.id === 'c-extra')?.customX).toBe(2)
    const ungrouped = ungroupTemplateV2ComponentInUi(grouped.ui, grouped.selection.componentIndex, {
      childArrayInfo: childArrayInfo as never,
      componentBox: componentBox as never,
      elementBox: elementBox as never,
      layoutChildren: layoutChildren as never,
    })!
    expect(components(ungrouped.ui as RawUi).find((c) => c.id === 'c-extra')?.customX).toBe(2)
  })

  it('fixture uiWithVideoPlaceholder carries a placeholder layer', () => {
    expect(components(uiWithVideoPlaceholder())).toHaveLength(2)
  })
})
