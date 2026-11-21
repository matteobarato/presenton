<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { useMediaQuery } from '@vueuse/core'
import { ArrowRight, Check, LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { MAX_OUTLINE_SLIDES, preparePresentation, saveOutline } from '@/api/outlines'
import { listTemplates, templatesKey } from '@/api/templates'
import { useOutlineStream } from '@/composables/useOutlineStream'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import AiProgress from '@/components/shell/AiProgress.vue'
import OutlineList from '@/components/create/OutlineList.vue'
import TemplateCardThumb from '@/components/create/TemplateCardThumb.vue'
import NewTemplateSelector from '@/components/create/NewTemplateSelector.vue'
import type { FooterAction } from '@/components/create/wizard/stepFooter'
import WizardStepFooter from '@/components/create/wizard/WizardStepFooter.vue'
import { useDeckLook } from '@/composables/useDeckLook'
import { describeError } from '@/components/create/wizard/errorCopy'
import RegenerateDialog from './RegenerateDialog.vue'

/**
 * Step 3: read (and lightly edit) the outline, then generate the slides from it with the template chosen on
 * the Topic step (see `useDeckLook`: `?template=`, else the deck's remembered record, else its slides' template). A deck whose template is unknown gets a picker here. Once the deck has
 * slides the outline is read-only until regenerating is confirmed.
 */
const props = defineProps<{ presentation: Presentation; pipelineRunning?: boolean }>()
const emit = defineEmits<{ streaming: [value: boolean] }>()

const SAVE_DEBOUNCE_MS = 500
const NO_TEMPLATE = 'This deck has no template, so slides can’t be generated. Start a new deck and pick one.'
const PICK_TEMPLATE = 'Pick a template to generate slides'
const PIPELINE_BUSY = 'Narration is running; wait for it to finish'

const route = useRoute()
const router = useRouter()
const id = computed(() => props.presentation.id)

const { items, status, streaming, error, retry } = useOutlineStream(id)
watch(streaming, (v) => emit('streaming', v), { immediate: true })
onBeforeUnmount(() => emit('streaming', false))

const progressDetail = computed(() => {
  const n = items.value.length
  return n ? `${n} ${n === 1 ? 'slide' : 'slides'} drafted` : 'Starting…'
})
// Skeleton cards stand in for the slides still to come while the outline streams.
const skeletons = computed(() => (streaming.value ? Math.min(4, Math.max(1, (props.presentation.n_slides ?? 0) - items.value.length)) : 0))

// ── Template: chosen on the Topic step, shown read-only here ──
const templates = useQuery({ queryKey: templatesKey, queryFn: listTemplates })
const look = useDeckLook(id, toRef(props, 'presentation'), templates.data)
const templateId = look.templateId
// Once the list is in, remember the resolved look for this deck: a later visit without the query (library,
// editor, an older deck still in flight) still knows it.
watch(
  () => templates.isFetched.value,
  (fetched) => fetched && look.sync(),
  { immediate: true },
)
const chosenTemplate = computed(() => (templateId.value ? templates.data.value?.find((t) => t.id === templateId.value) : undefined))
const templateKnown = computed(() => !!templateId.value && !(templates.isSuccess.value && !chosenTemplate.value))
const compact = useMediaQuery('(max-width: 900px)')

// ── Read-only once slides exist ──
const hasSlides = computed(() => props.presentation.slides.length > 0)
const regenerating = ref(false)
const readOnly = computed(() => hasSlides.value && !regenerating.value)
// A deck created before templates were remembered (or whose template was deleted): ask for one here.
const showPicker = computed(
  () => !readOnly.value && !templateKnown.value && templates.isSuccess.value && (templates.data.value?.length ?? 0) > 0,
)
const pickedTemplate = computed<string | null>({ get: () => templateId.value, set: (t) => t && look.pick(t) })
const confirmOpen = ref(false)

// ── Debounced autosave of user edits ──
// Streamed updates are never saved: only changes made after streaming finished differ from the baseline.
let baseline = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null
let inflight: Promise<void> | null = null
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveError = ref<string | null>(null)
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
    saveTimer = setTimeout(() => void saveNow(), SAVE_DEBOUNCE_MS)
  },
  { deep: true },
)

function saveNow(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  const body = items.value.map((i) => ({ content: i.content }))
  const sent = snapshot()
  saveState.value = 'saving'
  const run = (async () => {
    try {
      await saveOutline(id.value, body)
      baseline = sent
      saveError.value = null
      saveState.value = 'saved'
    } catch (e) {
      saveError.value = describeError('Couldn’t save your outline edits', e, 'Retry before you leave.')
      saveState.value = 'error'
    }
  })()
  inflight = run
  void run.finally(() => {
    if (inflight === run) inflight = null
  })
  return run
}

/** Waits for a save already on its way, then sends an edit still inside the debounce window. */
async function flushSave() {
  if (inflight) await inflight
  if (saveTimer) await saveNow()
}

// Leaving inside the debounce window must not drop the user's last edit.
onBeforeUnmount(() => {
  if (saveTimer) void saveNow()
})

// ── Generate ──
const generating = ref(false)
const actionError = ref<string | null>(null)
const count = computed(() => items.value.length)
const overLimit = computed(() => count.value - MAX_OUTLINE_SLIDES)
const countLabel = computed(() => `${count.value} ${count.value === 1 ? 'slide' : 'slides'} · max ${MAX_OUTLINE_SLIDES}`)

const templateError = computed(() => (!readOnly.value && !templateKnown.value && !showPicker.value ? NO_TEMPLATE : null))
// Regenerating needs the template too: without one, don't offer to unlock an outline that can't be generated.
// Nor while voice or avatars are being made for the slides it would replace.
const canRegenerate = computed(() => templateKnown.value && !streaming.value && !props.pipelineRunning)
const actions = computed<FooterAction[]>(() =>
  readOnly.value
    ? [{ key: 'regenerate', label: 'Regenerate slides from outline…', icon: RotateCcw, variant: 'outline', disabled: !canRegenerate.value, onSelect: () => (confirmOpen.value = true) }]
    : [],
)
/** Why Generate can't run right now; shown in the footer status line. */
const blockReason = computed<string | null>(() => {
  if (streaming.value) return 'Writing your outline…'
  if (templateError.value) return null // shown as the footer alert
  if (showPicker.value) return PICK_TEMPLATE
  if (props.pipelineRunning) return PIPELINE_BUSY
  if (templates.isPending.value) return 'Loading the template…'
  if (count.value === 0) return 'Add at least one slide to continue'
  if (overLimit.value > 0) return `Remove ${overLimit.value} ${overLimit.value === 1 ? 'slide' : 'slides'} to continue (max ${MAX_OUTLINE_SLIDES})`
  return null
})
const canGenerate = computed(() => !readOnly.value && !generating.value && !templateError.value && blockReason.value === null)

const footerStatus = computed(() => {
  if (generating.value) return 'Preparing your slides…'
  if (readOnly.value) {
    if (streaming.value) return 'Loading the outline…'
    if (props.pipelineRunning) return PIPELINE_BUSY
    return templateKnown.value ? 'These slides were generated from this outline' : 'Regenerating needs a template, and this deck has none'
  }
  if (templateError.value) return '' // the footer alert says why
  if (blockReason.value) return blockReason.value
  // Scope only: no timing or cost is known here.
  const n = count.value
  return `Generates ${n} ${n === 1 ? 'slide' : 'slides'} from this outline${chosenTemplate.value ? ` in ${chosenTemplate.value.name}` : ''}. Nothing is narrated yet.`
})
const footerError = computed(() => actionError.value ?? templateError.value)

async function generate() {
  const layout = templateId.value
  if (!canGenerate.value || !layout) return
  // Recorded before leaving: later visits find it even if the URL is lost.
  look.sync()
  generating.value = true
  actionError.value = null
  try {
    // The edit made just before clicking must reach the server first. A failed save does not block:
    // the prepare call carries the outline itself.
    await flushSave()
    await preparePresentation({
      presentation_id: id.value,
      outlines: items.value.map((i) => ({ content: i.content })),
      layout,
    })
    // Keep the rest of the query: going Back to regenerate still needs the template.
    await router.replace({
      name: 'create',
      params: { id: id.value, step: 'preview' },
      query: { ...route.query, template: layout, stream: '1' },
    })
  } catch (e) {
    actionError.value = describeError('Couldn’t start generating slides', e, 'Your outline is kept; choose Generate slides to try again.')
  } finally {
    generating.value = false
  }
}

function continueToPreview() {
  const query = { ...route.query }
  delete query.stream
  void router.push({ name: 'create', params: { id: id.value, step: 'preview' }, query })
}
</script>

<template>
  <div class="grid grid-cols-[minmax(0,1fr)_196px] items-start gap-7 max-[900px]:grid-cols-1 max-[900px]:gap-4">
    <div class="flex min-w-0 flex-col gap-4">
      <div class="flex min-h-[24px] flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px]">
        <span class="text-[#9aabb4] tabular-nums" data-testid="outline-count">{{ countLabel }}</span>
        <span class="flex items-center gap-1.5" aria-live="polite" data-testid="outline-save">
          <template v-if="saveState === 'saving'">
            <LoaderCircle class="size-3 animate-spin text-[#9aabb4]" aria-hidden="true" />
            <span class="text-[#9aabb4]">Saving…</span>
          </template>
          <template v-else-if="saveState === 'saved'">
            <Check class="size-3 text-[#9fd3b4]" aria-hidden="true" />
            <span class="text-[#9aabb4]">Saved</span>
          </template>
          <template v-else-if="saveState === 'error'">
            <TriangleAlert class="size-3 text-danger-text" aria-hidden="true" />
            <span class="text-danger-text">{{ saveError }}</span>
            <Button type="button" size="sm" variant="ghost" class="h-6 px-2" @click="saveNow()">Retry</Button>
          </template>
        </span>
      </div>

      <Transition name="step-panel">
        <AiProgress v-if="streaming" :stage="status" :detail="progressDetail" label="Outline progress" />
      </Transition>

      <Alert v-if="error" variant="destructive" class="flex items-center justify-between gap-3 py-2 text-[12px]">
        <span>{{ describeError('The outline stopped before it was finished', new Error(error), 'Retry to write it again.') }}</span>
        <Button type="button" size="sm" variant="secondary" @click="retry()">Retry</Button>
      </Alert>

      <p
        v-if="overLimit > 0"
        class="flex items-center gap-2 rounded-card border border-[#e3b04b33] bg-[#e3b04b0d] px-3 py-2 text-[12px] text-[#e8c987]"
        role="alert"
        data-testid="outline-limit"
      >
        <TriangleAlert class="size-3.5 flex-none" aria-hidden="true" />
        {{ count }} slides — a deck can have at most {{ MAX_OUTLINE_SLIDES }}. Remove {{ overLimit }} to continue (max {{ MAX_OUTLINE_SLIDES }}).
      </p>

      <section v-if="showPicker" class="flex flex-col gap-3" aria-label="Pick a template" data-testid="outline-template-picker">
        <p class="text-[12px] text-[#d4dee3]">This deck has no template yet. Pick one to generate its slides.</p>
        <NewTemplateSelector v-model="pickedTemplate" :templates="templates.data.value ?? []" :allow-later="false" :disabled="generating" />
      </section>

      <OutlineList v-if="items.length || !streaming" v-model="items" :disabled="streaming || readOnly || generating" />
      <div v-if="skeletons" class="flex flex-col gap-2" aria-hidden="true">
        <div
          v-for="n in skeletons"
          :key="n"
          class="skeleton-shimmer h-[62px] rounded-card"
          :style="{ opacity: 1 - n * 0.18 }"
          data-testid="outline-skeleton"
        />
      </div>
    </div>

    <aside
      class="sticky top-0 flex flex-col gap-3 rounded-card border border-white/[0.07] bg-white/[0.02] p-3 max-[900px]:static max-[900px]:order-first max-[900px]:flex-row max-[900px]:items-center"
      aria-label="Template"
      data-testid="outline-look"
    >
      <TemplateCardThumb v-if="chosenTemplate" :template="chosenTemplate" :width="compact ? 84 : 170" />
      <div class="flex min-w-0 flex-col gap-1.5">
        <span class="truncate text-[12px] font-medium text-[#e4ecf0]">{{ chosenTemplate?.name ?? 'No template' }}</span>
      </div>
    </aside>
  </div>

  <RegenerateDialog v-model:open="confirmOpen" @confirm="regenerating = true" />

  <WizardStepFooter :status="footerStatus" :error="footerError" :busy="generating" :actions="actions">
    <template #primary>
      <Button v-if="readOnly" type="button" @click="continueToPreview">
        Continue to Preview<ArrowRight class="size-4" aria-hidden="true" />
      </Button>
      <Button v-else type="button" class="min-w-[180px] " :disabled="!canGenerate" @click="generate">
        {{ generating ? 'Preparing…' : 'Generate slides' }}
        <ArrowRight v-if="!generating" class="size-4" aria-hidden="true" />
      </Button>
    </template>
  </WizardStepFooter>
</template>
