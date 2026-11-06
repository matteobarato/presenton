<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { MAX_OUTLINE_SLIDES, preparePresentation, saveOutline } from '@/api/outlines'
import { listTemplates } from '@/api/templates'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import OutlineList from '@/components/create/OutlineList.vue'
import TemplatePicker from '@/components/create/TemplatePicker.vue'
import { useOutlineStream } from '@/composables/useOutlineStream'

const SAVE_DEBOUNCE_MS = 500

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id ?? ''))

const { items, status, streaming, error, retry } = useOutlineStream(id)
const templates = useQuery({ queryKey: ['templates'], queryFn: listTemplates })
const selectedTemplate = ref<string | null>(null)
const generating = ref(false)
const actionError = ref<string | null>(null)
const saveError = ref<string | null>(null)

// Debounced autosave of user edits. Streamed updates are never saved: only
// changes made after streaming finished differ from the baseline.
let baseline = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null
// The route param is already gone when a leaving view flushes, so remember the deck the edit belongs to.
let pendingId = ''
const snapshot = () => JSON.stringify(items.value)

// Sync flush: items are assigned just before streaming flips, so the baseline
// must be taken before the items watcher below can see the final list.
watch(
  streaming,
  (now) => {
    if (!now) baseline = snapshot()
  },
  { flush: 'sync' },
)

watch(
  items,
  () => {
    if (streaming.value || snapshot() === baseline) return
    if (saveTimer) clearTimeout(saveTimer)
    pendingId = id.value
    saveTimer = setTimeout(() => void saveNow(), SAVE_DEBOUNCE_MS)
  },
  { deep: true },
)

async function saveNow() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  const body = items.value.map((i) => ({ content: i.content }))
  const sent = snapshot()
  try {
    await saveOutline(pendingId || id.value, body)
    baseline = sent
    saveError.value = null
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Could not save your outline.'
  }
}

// Leaving inside the debounce window must not drop the user's last edit.
onBeforeUnmount(() => {
  if (saveTimer) void saveNow()
})

const canGenerate = computed(
  () =>
    !!selectedTemplate.value &&
    !streaming.value &&
    !generating.value &&
    items.value.length > 0 &&
    items.value.length <= MAX_OUTLINE_SLIDES,
)
const generateLabel = computed(() => (selectedTemplate.value ? 'Generate presentation' : 'Select a template'))

async function generate() {
  if (!canGenerate.value || !selectedTemplate.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  generating.value = true
  actionError.value = null
  try {
    await preparePresentation({
      presentation_id: id.value,
      outlines: items.value.map((i) => ({ content: i.content })),
      layout: selectedTemplate.value,
    })
    await router.replace({
      name: 'editor',
      params: { id: id.value },
      query: { stream: '1' },
    })
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : 'Error in presentation generation.'
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <section class="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8">
    <header class="flex flex-col gap-1">
      <h1 class="font-display text-[24px] font-medium tracking-[-0.03em]">Outline</h1>
      <p class="text-[12px] text-muted" role="status" aria-live="polite">
        {{ status }}
      </p>
    </header>

    <Alert v-if="error" variant="destructive" class="flex items-center justify-between gap-3 py-2 text-[12px]">
      <span>{{ error }}</span>
      <Button type="button" size="sm" variant="secondary" @click="retry()">Retry</Button>
    </Alert>
    <Alert v-if="saveError" variant="destructive" class="py-2 text-[12px]">{{ saveError }}</Alert>

    <OutlineList v-model="items" :disabled="streaming" />

    <div class="flex flex-col gap-3">
      <h2 class="text-[13px] font-semibold">Template</h2>
      <Skeleton v-if="templates.isPending.value" class="h-32 w-full" />
      <Alert v-else-if="templates.isError.value" variant="destructive" class="py-2 text-[12px]">
        Templates could not be loaded.
      </Alert>
      <TemplatePicker v-else v-model="selectedTemplate" :templates="templates.data.value ?? []" />
    </div>

    <Alert v-if="actionError" variant="destructive" class="py-2 text-[12px]">{{ actionError }}</Alert>
    <div class="flex justify-end">
      <Button type="button" :disabled="!canGenerate" @click="generate">
        {{ generating ? 'Preparing…' : generateLabel }}
      </Button>
    </div>
  </section>
</template>
