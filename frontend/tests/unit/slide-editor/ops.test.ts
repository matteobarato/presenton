/* eslint-disable @typescript-eslint/no-explicit-any -- loose mock call inspection */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createTemplateV2ClipboardPayload,
  componentBox,
  type RawUi,
} from '@/slide-editor/model'
import {
  deleteSelection,
  duplicateSelection,
  groupSelection,
  nudge,
  pasteFromPayload,
  ungroupSelection,
} from '@/slide-editor/ops'
import { CLIPBOARD_PREFIX, CLIPBOARD_STORAGE_KEY, useClipboard } from '@/slide-editor/useClipboard'
import { uiTwoComponents, uiWithText } from './fixtures'

const comps = (ui: RawUi) => ui.components as Array<Record<string, any>>

describe('ops', () => {
  it('delete removes the component and clears the selection', () => {
    const r = deleteSelection(uiTwoComponents(), { kind: 'component', componentIndex: 0 })!
    expect(comps(r.ui)).toHaveLength(1)
    expect(comps(r.ui)[0]!.id).toBe('c-image')
    expect(r.selection).toBeNull()
    expect(deleteSelection(uiTwoComponents(), null)).toBeNull()
  })

  it('duplicate adds an offset copy and selects it', () => {
    const r = duplicateSelection(uiWithText(), { kind: 'component', componentIndex: 0 })!
    expect(comps(r.ui)).toHaveLength(2)
    expect(comps(r.ui)[1]!.position).toEqual({ x: 116, y: 96 })
    expect(comps(r.ui)[1]!.id).not.toBe('c-text')
    expect(r.selection).toEqual({ kind: 'component', componentIndex: 1 })
  })

  it('group of [0,1] yields one component and ungroup restores two', () => {
    const grouped = groupSelection(uiTwoComponents(), { kind: 'multi-component', componentIndexes: [0, 1] })!
    expect(comps(grouped.ui)).toHaveLength(1)
    expect(grouped.selection).toEqual({ kind: 'component', componentIndex: 0 })
    const ungrouped = ungroupSelection(grouped.ui, grouped.selection)!
    expect(comps(ungrouped.ui)).toHaveLength(2)
    expect(groupSelection(uiTwoComponents(), { kind: 'component', componentIndex: 0 })).toBeNull()
  })

  it('nudge moves by the delta and clamps into the slide', () => {
    const sel = { kind: 'component', componentIndex: 0 } as const
    const moved = nudge(uiWithText(), sel, 10, -5)!
    expect(comps(moved.ui)[0]!.position).toEqual({ x: 110, y: 75 })
    const clamped = nudge(uiWithText(), sel, -500, 0)!
    expect(comps(clamped.ui)[0]!.position.x).toBe(0)
    const right = nudge(uiWithText(), sel, 5000, 0)!
    const box = componentBox(comps(right.ui)[0]!)
    expect(box.x + box.width).toBe(1280)
    expect(nudge(clamped.ui, sel, -1, 0)).toBeNull()
  })
})

describe('element nudge', () => {
  const withNested = (): RawUi =>
    ({
      components: [
        {
          id: 'c',
          position: { x: 100, y: 80 },
          elements: [
            { type: 'text', position: { x: 10, y: 20 }, size: { width: 100, height: 40 }, text: 'a' },
            {
              type: 'flex',
              position: { x: 0, y: 100 },
              size: { width: 300, height: 100 },
              children: [
                { type: 'shape', size: { width: 50, height: 50 } },
                { type: 'shape', size: { width: 50, height: 50 }, __presenton_manual_position: true, position: { x: 5, y: 5 } },
              ],
            },
          ],
        },
      ],
      elements: [{ type: 'shape', position: { x: 0, y: 0 }, size: { width: 200, height: 100 } }],
    }) as unknown as RawUi
  const el = (componentIndex: number, elementPath: number[]) => ({ kind: 'element', componentIndex, elementPath }) as const

  it('moves the element, not its component, by 1 and 10', () => {
    const one = nudge(withNested(), el(0, [0]), 1, 0)!
    expect(comps(one.ui)[0]!.position).toEqual({ x: 100, y: 80 })
    expect(comps(one.ui)[0]!.elements[0].position).toEqual({ x: 11, y: 20 })
    expect(one.selection).toEqual(el(0, [0]))
    const ten = nudge(withNested(), el(0, [0]), 0, 10)!
    expect(comps(ten.ui)[0]!.elements[0].position).toEqual({ x: 10, y: 30 })
  })

  it('nudges root elements and clamps by absolute box', () => {
    const r = nudge(withNested(), el(-1, [0]), 10, 5)!
    expect((r.ui.elements as any[])[0].position).toEqual({ x: 10, y: 5 })
    expect(nudge(withNested(), el(-1, [0]), -50, 0)).toBeNull()
    const far = nudge(withNested(), el(0, [0]), 5000, 0)!
    expect(comps(far.ui)[0]!.elements[0].position.x).toBe(1280 - 100 - 100)
  })

  it('skips layout-managed children but moves manual ones', () => {
    expect(nudge(withNested(), el(0, [1, 0]), 1, 0)).toBeNull()
    const manual = nudge(withNested(), el(0, [1, 1]), 1, 0)!
    expect(comps(manual.ui)[0]!.elements[1].children[1].position).toEqual({ x: 6, y: 5 })
  })
})

describe('clipboard payloads', () => {
  beforeEach(() => window.localStorage.clear())

  it('pastes old-app text payload', async () => {
    const ui = uiWithText()
    const component = comps(ui)[0]!
    const payload = createTemplateV2ClipboardPayload([{ data: component, absoluteBox: componentBox(component) }])
    const event = {
      clipboardData: {
        types: ['text/plain'],
        getData: (t: string) => (t === 'text/plain' ? `${CLIPBOARD_PREFIX}${JSON.stringify(payload)}` : ''),
      },
    } as unknown as ClipboardEvent
    const read = await useClipboard().readPayload(event)
    expect(read).not.toBeNull()
    const r = pasteFromPayload(ui, read!, 16)!
    expect(comps(r.ui)).toHaveLength(2)
    expect(comps(r.ui)[1]!.id).not.toBe(component.id)
  })

  it('ignores foreign clipboard text and falls back to localStorage without an event', async () => {
    const foreign = { clipboardData: { types: ['text/plain'], getData: () => 'hello' } } as unknown as ClipboardEvent
    window.localStorage.setItem(CLIPBOARD_STORAGE_KEY, '{}')
    expect(await useClipboard().readPayload(foreign)).toBeNull()
    const ui = uiWithText()
    await useClipboard().copy(ui, { kind: 'component', componentIndex: 0 })
    expect(window.localStorage.getItem(CLIPBOARD_STORAGE_KEY)).toContain('presenton/template-v2')
    expect(await useClipboard().readPayload()).not.toBeNull()
  })
})
