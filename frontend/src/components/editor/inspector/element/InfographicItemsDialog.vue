<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, ImageIcon, Plus, Trash2 } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { normalizeInfographicIcon } from '@/render/legacy/components/slide-editor/infographics/infographic-editing'
import { defaultInfographicIcon } from '@/render/legacy/components/slide-editor/infographics/infographic-icons'
import { resolveAssetUrl } from '@/render/legacy/lib/template-v2-json-to-html'
import { getElementAtSelection, updateElementInUi, type ElementSelection, type RawUi } from '@/slide-editor/model'
import {
  draftComplete,
  infographicType,
  itemLimits,
  newDraftItem,
  toDraftItems,
  writeItems,
  type DraftItem,
  type ItemType,
} from '@/slide-editor/infographicOps'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import IconPickerDialog from './IconPickerDialog.vue'

const props = defineProps<{ open: boolean; root: ElementSelection }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const editing = useSlideEditingContext()

// Everything below works on the state captured when the dialog opened; later selection changes are ignored.
let snapshotUi: RawUi | null = null
let snapshotRoot: ElementSelection | null = null
let initialItems = ''
// Set once Done or Cancel ran, so our own commit landing before the parent closes us is not a remote change.
let finished = false
const items = ref<DraftItem[]>([])
const type = ref<ItemType>('vertical_funnel')
const pickerIndex = ref<number | null>(null)

const limits = computed(() => itemLimits(type.value))
const complete = computed(() => draftComplete(type.value, items.value))
const changed = () => JSON.stringify(items.value) !== initialItems

function begin() {
  const ui = editing.ui.value
  finished = false
  snapshotUi = ui
  snapshotRoot = props.root
  pickerIndex.value = null
  items.value = []
  initialItems = '[]'
  const el = ui ? getElementAtSelection(ui, props.root) : null
  if (!el) {
    snapshotUi = null
    return
  }
  type.value = infographicType(el) === 'maturity_model' ? 'maturity_model' : 'vertical_funnel'
  items.value = toDraftItems(el)
  initialItems = JSON.stringify(items.value)
}

function edited(): RawUi | null {
  if (!snapshotUi || !snapshotRoot) return null
  const drafts = items.value
  return updateElementInUi(snapshotUi, snapshotRoot, (raw) => writeItems(raw, drafts))
}
// While a value is incomplete the preview keeps the last complete draft.
function preview() {
  if (!complete.value) return
  const next = edited()
  if (next) editing.draftUi.value = next
}
function edit(next: DraftItem[]) {
  items.value = next
  preview()
}
const setField = (index: number, patch: Partial<DraftItem>) => edit(items.value.map((item, i) => (i === index ? { ...item, ...patch } : item)))
function move(index: number, by: -1 | 1) {
  const next = [...items.value]
  const other = index + by
  if (other < 0 || other >= next.length) return
  ;[next[index], next[other]] = [next[other]!, next[index]!]
  edit(next)
}
const remove = (index: number) => items.value.length > limits.value.min && edit(items.value.filter((_, i) => i !== index))
const add = () => items.value.length < limits.value.max && edit([...items.value, newDraftItem(type.value, items.value)])

const iconOf = (item: DraftItem) => (item.icon && typeof item.icon === 'object' ? (item.icon as Record<string, unknown>) : {})
const iconUrl = (item: DraftItem) => (typeof iconOf(item).url === 'string' ? (iconOf(item).url as string) : '')
function onPick(url: string) {
  const index = pickerIndex.value
  if (index === null) return
  const item = items.value[index]
  // The old editor's shape: { url, color }, the colour kept or its default.
  if (item) setField(index, { icon: { url, color: normalizeInfographicIcon(item.icon)?.color ?? defaultInfographicIcon(index).color } })
}

function close() {
  emit('update:open', false)
}
function cancel() {
  finished = true
  pickerIndex.value = null
  editing.cancelDraft()
  close()
}
function done() {
  if (!complete.value) return
  finished = true
  // Built from the snapshot, not read back from draftUi: an own commit landing meanwhile may have dropped the draft.
  const next = changed() ? edited() : null
  if (next) void editing.commit(next, 'Edit items')
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
      pickerIndex.value = null
      snapshotUi = snapshotRoot = null
    }
  },
  { immediate: true },
)

// A slide switch, a remote update to the saved ui (including the infographic being deleted) or the editor
// locking invalidates the snapshot: discard and close. An own commit landing (one in flight when the dialog
// opened, already in the snapshot) is not remote: the context drops its draft for it, so put the preview back.
watch([() => editing.slideId.value, () => editing.committedUi.value, () => editing.enabled.value], ([id, committed, on], [prevId]) => {
  if (!props.open || finished) return
  if (id === prevId && on && editing.isOwnCommit(committed)) {
    if (changed()) preview()
    return
  }
  cancel()
})
// The selection moved to another element.
watch(
  () => JSON.stringify(props.root),
  () => {
    if (props.open && !finished) cancel()
  },
)
// Unmounted while open (the section lost its infographic): never leave a preview behind.
onBeforeUnmount(() => {
  if (props.open && !finished) editing.cancelDraft()
})

const input =
  'h-8 w-full min-w-0 rounded-control border border-ov/[0.06] bg-field px-2 text-[12px] text-tx-dce3e7 outline-none focus:border-accent/60 aria-[invalid=true]:border-red-400/70'
const area = 'w-full min-w-0 resize-none rounded-control border border-ov/[0.06] bg-field px-2 py-1.5 text-[12px] text-tx-dce3e7 outline-none focus:border-accent/60'
const ghost =
  'inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-[12px] text-tx-dce3e7 hover:bg-ov/[0.08] disabled:opacity-40 disabled:hover:bg-transparent'
</script>

<template>
  <Dialog :open="props.open" @update:open="onOpenChange">
    <DialogContent class="w-[min(640px,calc(100vw-32px))] max-w-[640px]" data-inline-edit-ignore="true">
      <DialogHeader>
        <DialogTitle>Edit items</DialogTitle>
        <DialogDescription>Changes preview on the slide. Done saves them.</DialogDescription>
      </DialogHeader>
      <div class="mt-4 flex max-h-[min(420px,calc(100dvh-280px))] flex-col gap-2 overflow-auto">
        <div v-for="(item, i) in items" :key="i" class="flex items-start gap-2 rounded-control border border-ov/[0.06] p-2">
          <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <div class="flex items-center gap-2">
              <input
                v-if="type === 'vertical_funnel'"
                type="text"
                inputmode="decimal"
                :aria-label="`Value ${i + 1}`"
                :aria-invalid="!draftComplete(type, [item])"
                placeholder="Value"
                class="!w-20 shrink-0"
                :class="input"
                :value="item.value ?? ''"
                @input="setField(i, { value: ($event.target as HTMLInputElement).value })"
              />
              <button
                v-else
                type="button"
                :aria-label="`Change icon ${i + 1}`"
                title="Change icon"
                class="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-control border border-ov/[0.06] bg-field hover:bg-ov/[0.08]"
                @click="pickerIndex = i"
              >
                <img v-if="iconUrl(item)" :src="resolveAssetUrl(iconUrl(item))" alt="" class="size-5 object-contain" />
                <ImageIcon v-else class="size-4 text-tx-9aa9b0" />
              </button>
              <input type="text" :aria-label="`Heading ${i + 1}`" placeholder="Heading" :class="input" :value="item.heading" @input="setField(i, { heading: ($event.target as HTMLInputElement).value })" />
            </div>
            <textarea
              v-if="type === 'maturity_model'"
              :aria-label="`Description ${i + 1}`"
              rows="3"
              placeholder="Description"
              :class="area"
              :value="item.description"
              @input="setField(i, { description: ($event.target as HTMLTextAreaElement).value })"
            />
            <input v-else type="text" :aria-label="`Description ${i + 1}`" placeholder="Description" :class="input" :value="item.description" @input="setField(i, { description: ($event.target as HTMLInputElement).value })" />
          </div>
          <div class="flex shrink-0 gap-0.5">
            <button type="button" :aria-label="`Move item ${i + 1} up`" :class="[ghost, '!px-1.5']" :disabled="i === 0" @click="move(i, -1)"><ArrowUp class="size-3.5" /></button>
            <button type="button" :aria-label="`Move item ${i + 1} down`" :class="[ghost, '!px-1.5']" :disabled="i === items.length - 1" @click="move(i, 1)"><ArrowDown class="size-3.5" /></button>
            <button type="button" :aria-label="`Delete item ${i + 1}`" :class="[ghost, '!px-1.5']" :disabled="items.length <= limits.min" @click="remove(i)"><Trash2 class="size-3.5" /></button>
          </div>
        </div>
      </div>
      <div class="mt-3 flex gap-2">
        <button type="button" :class="ghost" :disabled="items.length >= limits.max" @click="add"><Plus class="size-3.5" />Add item</button>
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="inline-flex h-9 items-center rounded-control px-3.5 text-[12px] text-tx-dce3e7 hover:bg-ov/[0.08]" @click="cancel">Cancel</button>
        <button type="button" class="inline-flex h-9 items-center rounded-control bg-accent px-3.5 text-[12px] font-semibold text-tx-0b1a22 disabled:opacity-40" :disabled="!complete" @click="done">Done</button>
      </div>
    </DialogContent>
  </Dialog>
  <IconPickerDialog
    v-if="type === 'maturity_model'"
    :open="pickerIndex !== null"
    :current-url="pickerIndex !== null ? iconUrl(items[pickerIndex] ?? {}) || null : null"
    weight="bold"
    @update:open="(v) => !v && (pickerIndex = null)"
    @pick="onPick"
  />
</template>
