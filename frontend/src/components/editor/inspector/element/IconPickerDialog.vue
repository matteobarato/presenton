<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Loader2, Search } from 'lucide-vue-next'
import { ICON_WEIGHTS, replaceIconWeightInUrl, searchIcons } from '@/api/icons'
import SegmentedControl from '@/components/editor/inspector/controls/SegmentedControl.vue'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { resolveAssetUrl } from '@/render/legacy/lib/template-v2-json-to-html'
import type { IconWeight } from '@/slide-editor/elementStyle'

const props = defineProps<{ open: boolean; currentUrl: string | null; weight: IconWeight }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; pick: [url: string, weight: IconWeight] }>()

const DEBOUNCE_MS = 300
const query = ref('')
const weight = ref<IconWeight>(props.weight)
const results = ref<string[]>([])
const selected = ref<string | null>(null)
const loading = ref(false)
const error = ref('')
const searched = ref(false)
const WEIGHTS = ICON_WEIGHTS.map((w) => ({ value: w, label: w[0]!.toUpperCase() + w.slice(1) }))

let requestId = 0
let controller: AbortController | null = null
let timer: ReturnType<typeof setTimeout> | undefined

function stop() {
  clearTimeout(timer)
  controller?.abort()
  controller = null
  requestId++
  loading.value = false
}

async function run() {
  const text = query.value.trim()
  controller?.abort()
  if (!text) {
    requestId++
    loading.value = false
    results.value = []
    searched.value = false
    error.value = ''
    return
  }
  const id = ++requestId
  const own = new AbortController()
  controller = own
  loading.value = true
  error.value = ''
  try {
    const found = await searchIcons({ query: text, icon_weight: weight.value }, own.signal)
    if (id !== requestId) return
    results.value = found
    searched.value = true
  } catch (e) {
    if (id !== requestId) return
    error.value = e instanceof Error && e.message ? e.message : 'Failed to search icons.'
  } finally {
    if (id === requestId) loading.value = false
  }
}
function schedule() {
  clearTimeout(timer)
  timer = setTimeout(() => void run(), DEBOUNCE_MS)
}

watch(query, schedule)
watch(
  () => props.open,
  (open) => {
    if (open) {
      weight.value = props.weight
      selected.value = null
    } else stop()
  },
)
function setWeight(value: string) {
  weight.value = value as IconWeight
  if (selected.value) selected.value = replaceIconWeightInUrl(selected.value, weight.value)
  if (query.value.trim()) {
    clearTimeout(timer)
    void run()
  }
}
function replace() {
  if (!selected.value) return
  emit('pick', selected.value, weight.value)
  emit('update:open', false)
}
onBeforeUnmount(stop)

const fieldClass =
  'h-9 min-w-0 flex-1 rounded-control border border-white/[0.06] bg-field px-3 text-[12px] text-[#dce3e7] outline-none focus:border-accent/60'
const thumb =
  'grid aspect-square place-items-center rounded-control border border-white/[0.06] bg-field hover:border-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent'
const alertClass = 'flex items-center justify-between gap-2 rounded-control bg-danger px-3 py-2 text-[12px] text-danger-text'
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="w-[min(560px,calc(100vw-32px))]" data-inline-edit-ignore="true">
      <DialogHeader>
        <DialogTitle>Change icon</DialogTitle>
        <DialogDescription>Search for an icon and choose its weight.</DialogDescription>
      </DialogHeader>
      <div class="mt-4 flex flex-col gap-3">
        <div class="flex gap-2">
          <input v-model="query" type="search" aria-label="Search icons" placeholder="Search icons" :class="fieldClass" />
          <span class="grid size-9 place-items-center text-[#9aa9b0]" aria-hidden="true">
            <Loader2 v-if="loading" class="size-4 animate-spin" />
            <Search v-else class="size-4" />
          </span>
        </div>
        <SegmentedControl :model-value="weight" :options="WEIGHTS" label="Icon weight" @update:model-value="setWeight" />
        <p v-if="error" role="alert" :class="alertClass">
          <span>{{ error }}</span>
          <button type="button" class="rounded-control px-2 py-1 hover:bg-white/[0.08]" @click="run">Retry</button>
        </p>
        <p v-else-if="loading && !results.length" class="text-[12px] text-[#9aa9b0]">Searching...</p>
        <p v-else-if="searched && !results.length" class="text-[12px] text-[#9aa9b0]">No icons for "{{ query.trim() }}"</p>
        <div v-else-if="results.length" class="grid max-h-[320px] grid-cols-6 gap-2 overflow-y-auto">
          <button
            v-for="(url, i) in results"
            :key="url"
            type="button"
            :class="[thumb, selected === url && '!border-accent !bg-[#303c42]']"
            :aria-label="`Icon ${i + 1}`"
            :aria-pressed="selected === url"
            @click="selected = url"
          >
            <span
              class="size-6 bg-[#d0d7dc]"
              :style="{ maskImage: `url(${resolveAssetUrl(url)})`, WebkitMaskImage: `url(${resolveAssetUrl(url)})`, maskSize: 'contain', WebkitMaskSize: 'contain', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskPosition: 'center', WebkitMaskPosition: 'center' }"
            />
          </button>
        </div>
        <div class="flex justify-end">
          <button
            type="button"
            class="inline-flex h-9 items-center rounded-control bg-accent px-3.5 text-[12px] font-semibold text-[#0b1a22] disabled:opacity-40"
            :disabled="!selected"
            @click="replace"
          >
            Replace
          </button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
