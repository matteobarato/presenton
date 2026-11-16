<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Trash2 } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CHART_TEXT_MAX_LENGTH, chartSupportsMultipleSeries } from '@/render/legacy/components/slide-editor/charts/chart-data'
import type { ChartElement } from '@/render/legacy/components/slide-editor/types'
import { updateElementInUi, type ElementSelection, type RawUi } from '@/slide-editor/model'
import {
  addCategory,
  addSeries,
  canAddCategory,
  canAddSeries,
  chartGrid,
  deleteCategory,
  deleteSeries,
  isCompleteNumericInput,
  moveSeries,
  readChart,
  setCategory,
  setSeriesName,
  setValue,
  withGrid,
  writeChart,
  type ChartGrid,
} from '@/slide-editor/chartOps'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

const props = defineProps<{ open: boolean; root: ElementSelection }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const editing = useSlideEditingContext()

// Everything below works on the state captured when the dialog opened; later selection changes are ignored.
let snapshotUi: RawUi | null = null
let snapshotRoot: ElementSelection | null = null
let snapshotChart: ChartElement | null = null
let initialGrid = ''
// Set once Done or Cancel ran, so our own commit landing before the parent closes us is not a remote change.
let finished = false
const grid = ref<ChartGrid>({ categories: [], series: [] })
const drafts = ref<Record<string, string>>({})
const type = ref<ChartElement['chart_type']>('bar')
const multi = computed(() => chartSupportsMultipleSeries(type.value))

function begin() {
  const ui = editing.ui.value
  finished = false
  snapshotUi = ui
  snapshotRoot = props.root
  snapshotChart = null
  drafts.value = {}
  if (!ui) return
  let found: ChartElement | null = null
  updateElementInUi(ui, props.root, (el) => {
    found = readChart(el)
    return el
  })
  snapshotChart = found
  if (!found) return
  type.value = (found as ChartElement).chart_type
  grid.value = chartGrid(found)
  initialGrid = JSON.stringify(grid.value)
}

function preview() {
  if (!snapshotUi || !snapshotRoot || !snapshotChart) return
  const g = grid.value
  editing.draftUi.value = updateElementInUi(snapshotUi, snapshotRoot, (raw) => writeChart(raw, withGrid(readChart(raw), g)))
}
function edit(next: ChartGrid) {
  grid.value = next
  preview()
}

function close() {
  emit('update:open', false)
}
function cancel() {
  finished = true
  editing.cancelDraft()
  close()
}
function done() {
  finished = true
  // Incomplete cell drafts never reached the grid, so the last complete value stands.
  const changed = JSON.stringify(grid.value) !== initialGrid
  const next = editing.draftUi.value
  if (changed && next) void editing.commit(next, 'Edit chart data')
  else editing.cancelDraft()
  close()
}
function onOpenChange(v: boolean) {
  if (v) return
  cancel()
}

watch(
  () => props.open,
  (open) => {
    if (open) begin()
    else {
      drafts.value = {}
      snapshotUi = snapshotRoot = snapshotChart = null
    }
  },
  { immediate: true },
)

// A slide switch or a remote update to the saved ui invalidates the snapshot: discard and close.
watch([() => editing.slideId.value, () => editing.committedUi.value], () => {
  if (!props.open || finished) return
  cancel()
})

const key = (r: number, s: number) => `${r},${s}`
const cellText = (r: number, s: number) => drafts.value[key(r, s)] ?? String(grid.value.series[s]!.values[r])
function onValue(r: number, s: number, text: string) {
  drafts.value[key(r, s)] = text
  if (isCompleteNumericInput(text)) edit(setValue(grid.value, r, s, Number(text)))
}
function onValueBlur(r: number, s: number) {
  delete drafts.value[key(r, s)]
}
// Rows and series shift on add, delete and move, so per-cell drafts no longer line up.
function restructure(next: ChartGrid) {
  drafts.value = {}
  edit(next)
}

const input =
  'h-8 w-full min-w-0 rounded-control border border-white/[0.06] bg-field px-2 text-[12px] text-[#dce3e7] outline-none focus:border-accent/60'
const ghost =
  'inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-[12px] text-[#dce3e7] hover:bg-white/[0.08] disabled:opacity-40 disabled:hover:bg-transparent'
</script>

<template>
  <Dialog :open="props.open" @update:open="onOpenChange">
    <DialogContent class="w-[min(880px,calc(100vw-32px))] max-w-[880px]" data-inline-edit-ignore="true">
      <DialogHeader>
        <DialogTitle>Edit chart data</DialogTitle>
        <DialogDescription>Changes preview on the slide. Done applies them as one edit.</DialogDescription>
      </DialogHeader>
      <div class="mt-4 max-h-[min(420px,calc(100dvh-280px))] overflow-auto">
        <table class="w-full border-separate border-spacing-1.5 text-[12px]">
          <thead>
            <tr>
              <th class="w-8" />
              <th class="min-w-[140px] text-left text-[11px] font-normal text-[#9aa9b0]">Category</th>
              <th v-for="(s, si) in grid.series" :key="si" class="min-w-[130px] font-normal">
                <div class="flex items-center gap-1">
                  <input
                    type="text"
                    :aria-label="`Series ${si + 1} name`"
                    :maxlength="CHART_TEXT_MAX_LENGTH"
                    :class="input"
                    :value="s.name"
                    @input="edit(setSeriesName(grid, si, ($event.target as HTMLInputElement).value))"
                  />
                  <DropdownMenu v-if="multi">
                    <DropdownMenuTrigger as-child>
                      <button type="button" :aria-label="`Series ${si + 1} actions`" :class="[ghost, '!px-1.5']"><MoreHorizontal class="size-4" /></button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem :disabled="si === 0" @select="restructure(moveSeries(grid, si, -1))"><ChevronLeft class="size-3.5" />Move left</DropdownMenuItem>
                      <DropdownMenuItem :disabled="si === grid.series.length - 1" @select="restructure(moveSeries(grid, si, 1))"><ChevronRight class="size-3.5" />Move right</DropdownMenuItem>
                      <DropdownMenuItem :disabled="grid.series.length <= 1" @select="restructure(deleteSeries(grid, si))"><Trash2 class="size-3.5" />Delete series</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(c, ri) in grid.categories" :key="ri">
              <td>
                <button type="button" :aria-label="`Delete row ${ri + 1}`" :class="[ghost, '!px-1.5']" :disabled="grid.categories.length <= 1" @click="restructure(deleteCategory(grid, ri))">
                  <Trash2 class="size-3.5" />
                </button>
              </td>
              <td>
                <input type="text" :aria-label="`Category ${ri + 1}`" :maxlength="CHART_TEXT_MAX_LENGTH" :class="input" :value="c" @input="edit(setCategory(grid, ri, ($event.target as HTMLInputElement).value))" />
              </td>
              <td v-for="(_, si) in grid.series" :key="si">
                <input
                  type="text"
                  inputmode="decimal"
                  :aria-label="`Value ${ri + 1},${si + 1}`"
                  :class="input"
                  :value="cellText(ri, si)"
                  @input="onValue(ri, si, ($event.target as HTMLInputElement).value)"
                  @blur="onValueBlur(ri, si)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mt-3 flex gap-2">
        <button type="button" :class="ghost" :disabled="!canAddCategory(grid)" @click="restructure(addCategory(grid))"><Plus class="size-3.5" />Add row</button>
        <button v-if="multi" type="button" :class="ghost" :disabled="!canAddSeries(grid, type)" @click="restructure(addSeries(grid))"><Plus class="size-3.5" />Add series</button>
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="inline-flex h-9 items-center rounded-control px-3.5 text-[12px] text-[#dce3e7] hover:bg-white/[0.08]" @click="cancel">Cancel</button>
        <button type="button" class="inline-flex h-9 items-center rounded-control bg-accent px-3.5 text-[12px] font-semibold text-[#0b1a22]" @click="done">Done</button>
      </div>
    </DialogContent>
  </Dialog>
</template>
