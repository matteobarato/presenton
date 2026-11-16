// Pure infographic operations for the Infographic inspector section and its items dialog.
// Never mutate inputs. Meter patch and legacy-field cleanup port the logic of
// servers/nextjs/components/slide-editor/layout/InfographicToolbarControls.tsx; item fields and
// new-item defaults follow infographics/InfographicEditorContent.tsx (see the spec, section 4).
import {
  addInfographicToolbarItem,
  infographicToolbarItemStats,
  normalizeInfographicColors,
  removeLastInfographicToolbarItem,
} from '@/render/legacy/components/slide-editor/infographics/infographic-editing'
import type { InfographicType } from '@/render/legacy/components/slide-editor/types'
import { isCompleteNumericInput } from '@/slide-editor/chartOps'
import { resizedInfographicFrame, type RawElement } from '@/slide-editor/model'

type Rec = Record<string, unknown>

export type InfographicGroup = 'meter' | 'items' | 'other'
export type ItemType = 'vertical_funnel' | 'maturity_model'
export interface Meter { value: number; min: number; max: number }
export interface DraftItem { [key: string]: unknown; heading: string; description: string; value?: string }

const LEGACY_KEYS = ['infographic_type', 'value', 'min_value', 'max_value'] as const
const MATURITY_MAX = 7

function rec(value: unknown): Rec {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {}
}
function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
function colour(value: string): string {
  return (value.startsWith('#') ? value : `#${value}`).toLowerCase()
}
/** Builders return the input unchanged (setMeter: null) for anything but an infographic, so a stale call is a no-op. */
function isInfographic(el: RawElement): boolean {
  return el.type === 'infographic'
}
function withoutLegacy(el: RawElement): Rec {
  const next: Rec = { ...el }
  for (const key of LEGACY_KEYS) delete next[key]
  return next
}

export function infographicType(el: RawElement): string | null {
  const type = rec(el.data).type ?? el.infographic_type
  return typeof type === 'string' ? type : null
}

export function infographicGroup(el: RawElement): InfographicGroup {
  const type = infographicType(el)
  if (type === 'gauge' || type === 'progress_bar') return 'meter'
  if (type === 'vertical_funnel' || type === 'maturity_model') return 'items'
  return 'other'
}

export function readMeter(el: RawElement): Meter {
  const data = rec(el.data)
  const min = num(data.min_value, num(el.min_value, 0))
  const max = num(data.max_value, num(el.max_value, 100))
  return { value: num(data.value, num(el.value, min)), min, max }
}

/** The meter patched into `data`, legacy fields dropped. Null for an invalid patch or a non-infographic element, so the caller commits nothing. */
export function setMeter(el: RawElement, patch: Partial<Meter>): RawElement | null {
  if (!isInfographic(el)) return null
  if (Object.values(patch).some((v) => v !== undefined && !Number.isFinite(v))) return null
  const current = readMeter(el)
  const min = patch.min ?? current.min
  const max = patch.max ?? current.max
  if (min > max) return null
  const value = Math.min(max, Math.max(min, patch.value ?? current.value))
  const data = { ...rec(el.data), type: infographicType(el) ?? 'gauge', min_value: min, max_value: max, value }
  return { ...withoutLegacy(el), data } as RawElement
}

function legacyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
/**
 * The stored colours padded to the swatch count. An entry missing from `colors` comes from the legacy keys
 * before the defaults, with the renderer's precedence (template-v2-json-to-html.ts, infographicBaseColor and
 * infographicHighlightColor): entry 0 from `baseColor ?? base_color`; for meters, which are the only types that
 * draw a highlight, entry 1 from `highlightColor ?? highlight_color ?? color ?? fill.color`.
 */
function storedColors(el: RawElement): string[] {
  const type = (infographicType(el) ?? 'gauge') as InfographicType
  const colors = normalizeInfographicColors(el.colors, type)
  const given = Array.isArray(el.colors) ? el.colors.filter((c) => typeof c === 'string' && c.trim().length > 0).length : 0
  const legacy = [
    legacyString(el.baseColor ?? el.base_color),
    type === 'gauge' || type === 'progress_bar' ? legacyString(el.highlightColor ?? el.highlight_color ?? el.color ?? rec(el.fill).color) : null,
  ]
  legacy.forEach((value, i) => {
    if (i >= given && value) colors[i] = value
  })
  return colors
}

export function readColors(el: RawElement): string[] {
  return storedColors(el).map(colour)
}

export function setColor(el: RawElement, index: number, color: string): RawElement {
  if (!isInfographic(el)) return el
  const colors = storedColors(el)
  colors[index] = color
  const next: Rec = { ...el, colors }
  delete next.base_color
  delete next.highlight_color
  return next as RawElement
}

export function readTextColor(el: RawElement): string | null {
  return typeof el.text_color === 'string' && el.text_color ? colour(el.text_color) : null
}

export function setTextColor(el: RawElement, color: string): RawElement {
  if (!isInfographic(el)) return el
  return { ...el, text_color: color } as RawElement
}

export function itemLimits(type: ItemType): { min: number; max: number } {
  return type === 'maturity_model' ? { min: 1, max: MATURITY_MAX } : { min: 1, max: 8 }
}

function itemType(el: RawElement): ItemType {
  return infographicType(el) === 'maturity_model' ? 'maturity_model' : 'vertical_funnel'
}
function itemsOf(el: RawElement): unknown[] {
  const items = rec(el.data).items
  return Array.isArray(items) ? items : []
}
/** Data with `items` guaranteed to be an array, so the ported helpers treat a missing list as empty. */
function dataWithItems(el: RawElement): Rec {
  return { ...rec(el.data), type: infographicType(el), items: itemsOf(el) }
}
function withData(el: RawElement, data: unknown): RawElement {
  return { ...withoutLegacy(el), data, ...resizedInfographicFrame(el, data) } as RawElement
}

export function itemStats(el: RawElement): { count: number; canAdd: boolean; canRemove: boolean } {
  const count = itemsOf(el).length
  const limits = itemLimits(itemType(el))
  const stats = infographicToolbarItemStats(dataWithItems(el))
  return {
    count,
    canAdd: count < limits.max && (stats?.canAdd ?? true),
    canRemove: count > limits.min && (stats?.canRemove ?? false),
  }
}

export function addItem(el: RawElement): RawElement {
  if (!isInfographic(el) || !itemStats(el).canAdd) return el
  const next = addInfographicToolbarItem(dataWithItems(el))
  return next === el.data ? el : withData(el, next)
}

export function removeLastItem(el: RawElement): RawElement {
  if (!isInfographic(el) || !itemStats(el).canRemove) return el
  return withData(el, removeLastInfographicToolbarItem(dataWithItems(el)))
}

export function toDraftItems(el: RawElement): DraftItem[] {
  return itemsOf(el).map((raw) => {
    const item = rec(raw)
    const draft: DraftItem = {
      ...item,
      heading: typeof item.heading === 'string' ? item.heading : '',
      description: typeof item.description === 'string' ? item.description : '',
    }
    if (item.value !== undefined) draft.value = String(item.value)
    return draft
  })
}

export function newDraftItem(type: ItemType, items: DraftItem[]): DraftItem {
  const last = items.at(-1)
  if (type === 'vertical_funnel') {
    const previous = last?.value !== undefined && last.value !== '' ? Number(last.value) : NaN
    const value = Number.isFinite(previous) ? Math.max(0, previous - 10) : 60
    return { value: String(value), heading: `Stage ${items.length + 1}`, description: 'Add a description.' }
  }
  const icon = rec(last?.icon)
  return {
    icon: { ...icon, url: icon.url ?? '', color: icon.color ?? '#FFFFFF' },
    heading: `Level ${items.length + 1}`,
    description: '',
  }
}

export function draftComplete(type: ItemType, items: DraftItem[]): boolean {
  if (type !== 'vertical_funnel') return true
  return items.every((item) => isCompleteNumericInput(item.value ?? ''))
}

export function writeItems(el: RawElement, items: DraftItem[]): RawElement {
  if (!isInfographic(el)) return el
  const written = items.map((draft) => {
    const item: Rec = { ...draft }
    if (typeof draft.value === 'string') item.value = Number(draft.value)
    return item
  })
  return withData(el, { ...dataWithItems(el), items: written })
}
