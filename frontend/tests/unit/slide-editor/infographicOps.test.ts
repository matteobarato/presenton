import { describe, expect, it } from 'vitest'
import type { RawElement } from '@/slide-editor/model'
import {
  addItem, draftComplete, infographicGroup, itemStats, newDraftItem, readColors, readMeter, readTextColor,
  removeLastItem, setColor, setMeter, setTextColor, toDraftItems, writeItems,
} from '@/slide-editor/infographicOps'

type Rec = Record<string, unknown>

const gauge = {
  type: 'infographic', data: { type: 'gauge', min_value: 0, max_value: 100, value: 84 },
  infographic_type: 'gauge', value: 84, min_value: 0, max_value: 100, base_color: '#1D242D', highlight_color: '#448BCA',
} as RawElement
const funnel = (n: number) => ({
  type: 'infographic', position: { x: 0, y: 0 }, size: { width: 448, height: 322 },
  data: { type: 'vertical_funnel', items: Array.from({ length: n }, (_, i) => ({ value: 100 - i * 10, heading: `S${i}`, description: '' })) },
}) as RawElement
const maturity = (n: number) => ({
  type: 'infographic',
  data: { type: 'maturity_model', items: Array.from({ length: n }, () => ({ heading: 'L', description: '', icon: { url: 'u', color: '#18324A' } })) },
}) as RawElement

describe('meters', () => {
  it('clamps the value, drops legacy fields and keeps colours', () => {
    const next = setMeter(gauge, { value: 150 })!
    expect(next.data).toEqual({ type: 'gauge', min_value: 0, max_value: 100, value: 100 })
    for (const k of ['infographic_type', 'value', 'min_value', 'max_value']) expect(k in next).toBe(false)
    expect(next.base_color).toBe('#1D242D')
  })
  it('rejects invalid patches', () => {
    expect(setMeter(gauge, { min: 200 })).toBeNull()
    expect(setMeter(gauge, { value: NaN })).toBeNull()
  })
  it('lets the value follow a shrunk range', () => {
    expect((setMeter(gauge, { max: 50 })!.data as Rec).value).toBe(50)
  })
  it('reads and migrates a legacy-only meter', () => {
    const legacy = { type: 'infographic', infographic_type: 'progress_bar', value: 30, max_value: 60 } as RawElement
    expect(infographicGroup(legacy)).toBe('meter')
    expect(readMeter(legacy)).toEqual({ value: 30, min: 0, max: 60 })
    expect(setMeter(legacy, { value: 40 })!.data).toEqual({ type: 'progress_bar', min_value: 0, max_value: 60, value: 40 })
  })
  it('survives a degenerate range and clamps on the next edit', () => {
    const el = { type: 'infographic', data: { type: 'gauge', min_value: 5, max_value: 5, value: 9 } } as RawElement
    expect(readMeter(el)).toEqual({ value: 9, min: 5, max: 5 })
    expect((setMeter(el, { value: 9 })!.data as Rec).value).toBe(5)
  })
})

describe('colours', () => {
  it('pads and normalises on read', () => {
    expect(readColors({ type: 'infographic', data: { type: 'gauge' }, colors: ['FFFFFF'] } as RawElement)).toEqual(['#ffffff', '#2563eb'])
  })
  it('sets one swatch and keeps the others as stored', () => {
    const col = setColor({
      type: 'infographic', data: { type: 'vertical_funnel', items: [] }, colors: ['CFDAC9', '#285E1D'],
      base_color: '#000000', highlight_color: '#111111',
    } as RawElement, 0, '#aabbcc')
    expect(col.colors).toEqual(['#aabbcc', '#285E1D'])
    expect('base_color' in col || 'highlight_color' in col).toBe(false)
  })
  it('reads and writes the text colour', () => {
    expect(setTextColor({ type: 'infographic' } as RawElement, '#174b40').text_color).toBe('#174b40')
    expect(readTextColor({ type: 'infographic', text_color: null } as RawElement)).toBeNull()
  })
})

describe('items', () => {
  it('reports stats and limits', () => {
    expect(itemStats(funnel(8))).toEqual({ count: 8, canAdd: false, canRemove: true })
    expect(itemStats(funnel(1)).canRemove).toBe(false)
    expect(itemStats(maturity(7)).canAdd).toBe(false)
  })
  it('add and remove respect the caps and add grows the list', () => {
    const full = maturity(7)
    expect(addItem(full)).toBe(full)
    const one = funnel(1)
    expect(removeLastItem(one)).toBe(one)
    expect(((addItem(funnel(2)).data as Rec).items as unknown[]).length).toBe(3)
    expect(((removeLastItem(funnel(3)).data as Rec).items as unknown[]).length).toBe(2)
  })
  it('handles missing items', () => {
    const empty = { type: 'infographic', data: { type: 'vertical_funnel' } } as RawElement
    expect(itemStats(empty)).toEqual({ count: 0, canAdd: true, canRemove: false })
    expect(toDraftItems(empty)).toEqual([])
    expect(((addItem(empty).data as Rec).items as unknown[]).length).toBe(1)
    const bad = { type: 'infographic', data: { type: 'maturity_model', items: 'x' } } as RawElement
    expect(itemStats(bad).count).toBe(0)
  })
})

describe('drafts', () => {
  it('converts and creates draft items', () => {
    expect(toDraftItems(funnel(1))[0]).toMatchObject({ value: '100', heading: 'S0', description: '' })
    expect(newDraftItem('vertical_funnel', toDraftItems(funnel(1)))).toMatchObject({ value: '90', heading: 'Stage 2', description: 'Add a description.' })
    expect(newDraftItem('vertical_funnel', [])).toMatchObject({ value: '60', heading: 'Stage 1' })
    expect(newDraftItem('maturity_model', toDraftItems(maturity(2)))).toMatchObject({ heading: 'Level 3', description: '', icon: { url: 'u', color: '#18324A' } })
  })
  it('validates drafts', () => {
    expect(draftComplete('vertical_funnel', [{ heading: '', description: '', value: '' }])).toBe(false)
    expect(draftComplete('vertical_funnel', [{ heading: '', description: '', value: '-' }])).toBe(false)
    expect(draftComplete('vertical_funnel', [{ heading: '', description: '', value: '12.5' }])).toBe(true)
    expect(draftComplete('maturity_model', [{ heading: '', description: '' }])).toBe(true)
  })
  it('writes items back with numeric values and unknown fields kept', () => {
    const written = writeItems(funnel(2), [{ heading: 'A', description: 'd', value: '12.5', focus: 'kept' }])
    expect((written.data as Rec).items).toEqual([{ heading: 'A', description: 'd', value: 12.5, focus: 'kept' }])
    expect((written.data as Rec).type).toBe('vertical_funnel')
  })
})

describe('wrong element type', () => {
  const shape = { type: 'vector', colors: ['#000000'], data: { type: 'gauge', value: 1, items: [] } } as unknown as RawElement
  it('setMeter returns null, so the section commits nothing', () => {
    expect(setMeter(shape, { value: 5 })).toBeNull()
  })
  it('the other builders return the input unchanged', () => {
    expect(setColor(shape, 0, '#ffffff')).toBe(shape)
    expect(setTextColor(shape, '#ffffff')).toBe(shape)
    expect(addItem(shape)).toBe(shape)
    expect(removeLastItem(shape)).toBe(shape)
    expect(writeItems(shape, [{ heading: 'A', description: '' }])).toBe(shape)
  })
})
