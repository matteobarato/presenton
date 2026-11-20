<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { useMediaQuery } from '@vueuse/core'
import { ArrowRight, Check, LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { MAX_OUTLINE_SLIDES, preparePresentation, saveOutline } from '@/api/outlines'
import { listTemplates, templatesKey } from '@/api/templates'
import { updatePresentation } from '@/api/presentations'
import { useTemplateLayouts } from '@/composables/useTemplateLayouts'
import { useOutlineStream } from '@/composables/useOutlineStream'
import { useThemeParam } from '@/composables/useThemeParam'
import { withSourceTheme } from '@/render/retint'
import { DEFAULT_TEMPLATE_THEME, normalizeTemplateTheme } from '@/render/legacy/lib/template-theme'
import { toast } from '@/components/ui/sonner'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import AiProgress from '@/components/shell/AiProgress.vue'
import OutlineList from '@/components/create/OutlineList.vue'
import TemplateCardThumb from '@/components/create/TemplateCardThumb.vue'
import NewTemplateSelector from '@/components/create/NewTemplateSelector.vue'
import WizardStepFooter from '@/components/create/wizard/WizardStepFooter.vue'
import { useDeckLook } from '@/composables/useDeckLook'
import RegenerateDialog from './RegenerateDialog.vue'

/**
 * Step 4: read (and lightly edit) the outline, then generate the slides from it with the template chosen on
 * the Look step and the optional theme (see `useDeckLook`: `?template=`/`?theme=`, else the deck's remembered
 * record, else its slides' template). A deck whose template is unknown gets a picker here. Once the deck has
 * slides the outline is read-only until regenerating is confirmed.
 */
const props = defineProps<{ presentation: Presentation; pipelineRunning?: boolean }>()
const emit = defineEmits<{ streaming: [value: boolean] }>()

const SAVE_DEBOUNCE_MS = 500
const NO_TEMPLATE = 'No template chosen — start a new deck'
const PICK_TEMPLATE = 'Pick a template to generate'
const PIPELINE_BUSY = 'Wait for voice and avatars to finish'

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

// ── Template and theme: chosen on the Look step, shown read-only here ──
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
// The template's own palette travels with the theme, so the deck recolours by role instead of only setting variables.
const { theme: templatePalette } = useTemplateLayouts(chosenTemplate)
const { isPending: themesPending, isError: themesError, themeList } = useThemeParam()
const chosenTheme = computed(() => (look.themeId.value ? themeList.value.find((t) => t.id === look.themeId.value) : undefined))
// A chosen theme that the list has not resolved yet (or failed to load) must not be dropped silently.
const themeRequested = computed(() => !!look.themeId.value)
const themeName = computed(() => chosenTheme.value?.name ?? 'Template colours')
const themeDots = computed(() => {
  const p = normalizeTemplateTheme(chosenTheme.value ?? templatePalette.value) ?? DEFAULT_TEMPLATE_THEME
  return [p.background, p.primary, p.background_text]
})
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
      saveError.value = e instanceof Error && e.message ? e.message : 'Could not save your outline.'
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
/** Why Generate can't run right now; shown in the footer status line. */
const blockReason = computed<string | null>(() => {
  if (streaming.value) return 'Writing your outline…'
  if (templateError.value) return null // shown as the footer alert
  if (showPicker.value) return PICK_TEMPLATE
  if (props.pipelineRunning) return PIPELINE_BUSY
  if (templates.isPending.value) return 'Loading the template…'
  if (themeRequested.value && themesPending.value) return 'Loading your theme…'
  if (count.value === 0) return 'Add at least one slide'
  if (overLimit.value > 0) return `Remove ${overLimit.value} ${overLimit.value === 1 ? 'slide' : 'slides'} to continue (max ${MAX_OUTLINE_SLIDES})`
  return null
})
const canGenerate = computed(() => !readOnly.value && !generating.value && !templateError.value && blockReason.value === null)

const footerStatus = computed(() => {
  if (generating.value) return 'Preparing your slides…'
  if (readOnly.value) {
    if (streaming.value) return 'Loading the outline…'
    if (props.pipelineRunning) return PIPELINE_BUSY
    return templateKnown.value ? 'These slides were generated from this outline' : `To regenerate: ${NO_TEMPLATE}`
  }
  if (templateError.value) return 'Generate unavailable' // the footer alert says why
  return blockReason.value ?? `${count.value} ${count.value === 1 ? 'slide' : 'slides'} will be generated`
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
    // Template colours is the default: only an explicit theme is applied. A failure must not block the preview.
    if (themeRequested.value && themesError.value) {
      toast.error("Couldn't apply theme — set it in Design")
    } else if (chosenTheme.value) {
      try {
        await updatePresentation({ id: id.value, theme: withSourceTheme(chosenTheme.value, templatePalette.value) })
      } catch {
        toast.error("Couldn't apply theme — set it in Design")
      }
    }
    // Keep the rest of the query (template, theme): going Back to regenerate still needs the template.
    const theme = look.themeId.value
    await router.replace({
      name: 'create',
      params: { id: id.value, step: 'preview' },
      query: { ...route.query, template: layout, ...(theme && { theme }), stream: '1' },
    })
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : 'Error in presentation generation.'
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
      <div class="flex min-h-[24px] flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px]">
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
        <span>{{ error }}</span>
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
        <NewTemplateSelector v-model="pickedTemplate" :templates="templates.data.value ?? []" :allow-later="false" :disabled="generating" :theme="chosenTheme" />
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
      aria-label="Template and theme"
      data-testid="outline-look"
    >
      <TemplateCardThumb v-if="chosenTemplate" :template="chosenTemplate" :width="compact ? 84 : 170" :theme-override="chosenTheme" />
      <div class="flex min-w-0 flex-col gap-1.5">
        <span class="truncate text-[12px] font-medium text-[#e4ecf0]">{{ chosenTemplate?.name ?? 'No template' }}</span>
        <span class="flex items-center gap-1.5 text-[11px] text-[#a8b3b9]">
          <span class="flex items-center gap-0.5" aria-hidden="true">
            <i v-for="(c, n) in themeDots" :key="n" class="block size-[7px] rounded-full border border-white/[0.12]" :style="{ background: c }" />
          </span>
          <span class="truncate">{{ themeName }}</span>
        </span>
        <span class="text-[10px] text-[#7f8d95]">Theme can be changed later</span>
      </div>
    </aside>
  </div>

  <RegenerateDialog v-model:open="confirmOpen" @confirm="regenerating = true" />

  <WizardStepFooter :status="footerStatus" :error="footerError" :busy="generating">
    <template v-if="readOnly" #secondary>
      <Button type="button" variant="outline" :disabled="!canRegenerate" @click="confirmOpen = true">
        <RotateCcw class="size-4" aria-hidden="true" />Regenerate slides from outline…
      </Button>
    </template>
    <template #primary>
      <Button v-if="readOnly" type="button" @click="continueToPreview">
        Continue to Preview<ArrowRight class="size-4" aria-hidden="true" />
      </Button>
      <Button v-else type="button" class="min-w-[180px] max-[520px]:w-full" :disabled="!canGenerate" @click="generate">
        {{ generating ? 'Preparing…' : 'Generate slides' }}
        <ArrowRight v-if="!generating" class="size-4" aria-hidden="true" />
      </Button>
    </template>
  </WizardStepFooter>
</template>
