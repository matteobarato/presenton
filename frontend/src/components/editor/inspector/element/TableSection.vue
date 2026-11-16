<script setup lang="ts">
import { computed } from 'vue'
import { AlignCenter, AlignLeft, AlignRight, ArrowLeft, ArrowRight, Columns3, Rows3, Trash2 } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import SegmentedControl from '@/components/editor/inspector/controls/SegmentedControl.vue'
import { label, section, segment } from '@/components/editor/inspector/controls/styles'
import { asRecord, getElementAtSelection, type ElementSelection, type RawElement } from '@/slide-editor/model'
import { dataRoot } from '@/slide-editor/dataRoot'
import {
  addColumn,
  addRow,
  canAddColumn,
  canAddRow,
  canDeleteColumn,
  canDeleteRow,
  canMoveColumn,
  deleteColumn,
  deleteRow,
  moveColumn,
  setCellAlignment,
  setCellFill,
  tableCellAt,
  tableLimits,
  type TableCellRef,
} from '@/slide-editor/tableOps'
import { themePalette } from '@/slide-editor/themePalette'
import { useSelectedElement } from '@/slide-editor/useSelectedElement'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import TextSection from './TextSection.vue'

const props = defineProps<{ presentation: Presentation }>()

const ctx = useSlideEditingContext()
const { patch } = useSelectedElement(ctx)
const palette = computed(() => themePalette(props.presentation))

/** The table (it can sit inside a selected component); never the default `[0]` target. */
const root = computed<ElementSelection | null>(() => dataRoot(ctx.ui.value, ctx.selection.value, 'table'))
const table = computed<RawElement | null>(() => (ctx.ui.value && root.value ? getElementAtSelection(ctx.ui.value, root.value) : null))
const cell = computed<TableCellRef | null>(() => {
  const c = ctx.tableCell?.value
  const r = root.value
  if (!c || !r || JSON.stringify(c.root) !== JSON.stringify(r)) return null
  return { row: c.row, col: c.col }
})
const cellData = computed(() => (table.value && cell.value ? tableCellAt(table.value, cell.value) : null))
const textTarget = computed(() => (root.value ? ({ kind: 'table', root: root.value, cell: cell.value } as const) : undefined))

const limits = computed(() => (table.value ? tableLimits(table.value) : null))
const row = computed(() => cell.value?.row ?? null)
const col = computed(() => cell.value?.col ?? null)

const structure = computed(() => {
  const el = table.value
  const l = limits.value
  if (!el || !l) return []
  const deleteRowWhy = row.value === 0 ? "The header row can't be deleted" : row.value == null ? 'Select a cell to delete its row' : `Tables need at least ${l.minRows} rows`
  const deleteColWhy = col.value == null ? 'Select a cell to delete its column' : `Tables need at least ${l.minCols} column${l.minCols === 1 ? '' : 's'}`
  const moveWhy = 'Select a cell to move its column'
  const edge = (dir: -1 | 1) => (col.value == null ? moveWhy : dir < 0 ? 'This is the first column' : 'This is the last column')
  return [
    { label: 'Add row', icon: Rows3, ok: canAddRow(el), why: `Tables have at most ${l.maxRows} rows`, run: () => patch('Add row', (t) => addRow(t, row.value), root.value ?? undefined) },
    { label: 'Add column', icon: Columns3, ok: canAddColumn(el), why: `Tables have at most ${l.maxCols} columns`, run: () => patch('Add column', (t) => addColumn(t, col.value), root.value ?? undefined) },
    { label: 'Delete row', icon: Trash2, ok: canDeleteRow(el, row.value), why: deleteRowWhy, run: () => canDeleteRow(el, row.value) && patch('Delete row', (t) => deleteRow(t, row.value!), root.value ?? undefined) },
    { label: 'Delete column', icon: Trash2, ok: canDeleteColumn(el, col.value), why: deleteColWhy, run: () => canDeleteColumn(el, col.value) && patch('Delete column', (t) => deleteColumn(t, col.value!), root.value ?? undefined) },
    { label: 'Move column left', icon: ArrowLeft, ok: canMoveColumn(el, col.value, -1), why: edge(-1), run: () => canMoveColumn(el, col.value, -1) && move(-1) },
    { label: 'Move column right', icon: ArrowRight, ok: canMoveColumn(el, col.value, 1), why: edge(1), run: () => canMoveColumn(el, col.value, 1) && move(1) },
  ]
})

/** Moves the selected cell's column; the cell goes with it, so a second move keeps going the same way. */
function move(dir: -1 | 1) {
  const picked = ctx.tableCell.value
  const at = root.value
  if (!picked || !at || cell.value == null) return
  const from = cell.value.col
  patch(
    'Move column',
    (t) => {
      // Runs only when the patch is committed (it can be skipped while another commit applies).
      ctx.tableCell.value = { ...picked, col: from + dir }
      return moveColumn(t, from, dir)
    },
    at,
  )
}

// The cell and table at the moment the colour popover opened: the commit lands there even if the selection moves.
let anchor: { root: ElementSelection; cell: TableCellRef } | null = null
const hold = () => (anchor = root.value && cell.value ? { root: root.value, cell: cell.value } : null)
function cellBackground(color: string | null) {
  const held = anchor ?? (root.value && cell.value ? { root: root.value, cell: cell.value } : null)
  anchor = null
  if (!held) return
  patch('Cell background', (t) => setCellFill(t, held.cell, color), held.root)
}

const ALIGNS = [
  { value: 'left', label: 'Cell align left', icon: AlignLeft },
  { value: 'center', label: 'Cell align center', icon: AlignCenter },
  { value: 'right', label: 'Cell align right', icon: AlignRight },
]
const alignment = computed(() => {
  const a = cellData.value?.alignment
  return a === 'center' || a === 'right' ? a : 'left'
})
const cellColor = computed(() => {
  const fill = asRecord(cellData.value?.color) ?? asRecord(cellData.value?.fill)
  const c = typeof fill?.color === 'string' ? (fill.color.startsWith('#') ? fill.color : `#${fill.color}`) : null
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null
})
function setAlignment(value: string) {
  const c = cell.value
  if (c) patch('Cell alignment', (t) => setCellAlignment(t, c, value as 'left' | 'center' | 'right'), root.value ?? undefined)
}

const sub = 'mb-2 mt-4 text-[10px] text-[#9aa9b0]'
</script>

<template>
  <template v-if="table">
    <div :class="section">
      <div :class="label"><h3>Table</h3></div>
      <div class="grid grid-cols-6 gap-2">
        <button
          v-for="s in structure"
          :key="s.label"
          type="button"
          :class="[segment, 'disabled:cursor-not-allowed disabled:opacity-40']"
          :aria-label="s.label"
          :title="s.ok ? s.label : s.why"
          :disabled="!s.ok"
          @mousedown.prevent
          @click="s.run()"
        >
          <component :is="s.icon" class="size-4" aria-hidden="true" />
        </button>
      </div>
      <template v-if="cell">
        <div :class="[label, 'mt-5']">
          <h3>Cell</h3>
        </div>
        <ColorField :model-value="cellColor" :palette="palette" label="Cell background" allow-none @open="hold" @commit="cellBackground" />
        <div :class="sub">Alignment</div>
        <SegmentedControl :model-value="alignment" :options="ALIGNS" label="Cell alignment" @update:model-value="setAlignment" />
      </template>
    </div>
    <TextSection :presentation="props.presentation" :target="textTarget" />
  </template>
</template>
