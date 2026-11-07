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
