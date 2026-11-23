<script setup lang="ts">
import { ArrowRight, Sparkles } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useRoute, useRouter } from 'vue-router'
import { listTemplates, templatesKey } from '@/api/templates'
import { decomposeFiles, uploadFiles } from '@/api/files'
import { createPresentation } from '@/api/generation'
import { uploadPortrait } from '@/api/videos'
import { toast } from '@/components/ui/sonner'
import { rememberDeckLook } from '@/composables/useDeckLook'
import { useSessionStore } from '@/stores/session'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import NewPresenterStep from '@/components/create/NewPresenterStep.vue'
import NewSetupChips from '@/components/create/NewSetupChips.vue'
import NewTemplateSelector from '@/components/create/NewTemplateSelector.vue'
import TopicComposer from '@/components/create/TopicComposer.vue'
import WizardBackButton from '@/components/create/wizard/WizardBackButton.vue'
import WizardFooter from '@/components/create/wizard/WizardFooter.vue'
import WizardLayout from '@/components/create/wizard/WizardLayout.vue'
import BrandLogo from '@/components/shell/BrandLogo.vue'
import { type WizardStepItem, type WizardStepKey } from '@/components/create/wizard/progress'
import { useFooterNotice } from '@/components/create/wizard/stepFooter'
import { presenterSummary } from '@/components/create/setupSummary'
import { describeError } from '@/components/create/wizard/errorCopy'
import { useNewDraft } from '@/components/create/wizard/useNewDraft'
import { animateFlagKey, effectiveVideos, mediaCountForRequest, type CreateOptions } from '@/components/create/options'
import { AUTO_LANGUAGE } from '@/lib/languages'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const templateId = computed(() => (typeof route.query.template === 'string' ? route.query.template : ''))
const templates = useQuery({ queryKey: templatesKey, queryFn: listTemplates })
const chosen = computed(() => templates.data.value?.find((t) => t.id === templateId.value))

function setTemplate(id: string | null) {
  const rest = { ...route.query }
  if (id) rest.template = id
  else delete rest.template
  void router.replace({ query: rest })
}
const selectedTemplate = computed({
  get: () => chosen.value?.id ?? null,
  set: setTemplate,
})
// A deleted or garbage id must not linger in the URL.
watch(
  () => [templates.isSuccess.value, templates.data.value, templateId.value] as const,
  ([ok, list, id]) => {
    if (ok && id && !list?.some((t) => t.id === id)) setTemplate(null)
  },
  { immediate: true },
)
const session = useSessionStore()

const prompt = ref('')
const files = ref<File[]>([])
const options = ref<CreateOptions>({
  slides: '',
  images: '',
  videos: '',
  language: AUTO_LANGUAGE,
  tone: 'default',
  verbosity: 'standard',
  instructions: '',
  includeTitleSlide: false,
  includeTableOfContents: false,
  webSearch: false,
  animate: true,
})
// A reload keeps the prompt and options; files can't be kept, so the composer asks for them again.
const draft = useNewDraft(prompt, options)
watch(
  () => files.value.length > 0,
  (has) => {
    draft.hadFiles.value = has
  },
)
const filesLost = computed(() => draft.hadFiles.value && files.value.length === 0)

// The optional presenter photo: kept in memory, uploaded once the deck exists. No photo means no presenter slides.
const portrait = ref<File | null>(null)
/** "Add a digital presenter" is chosen (a photo may still be missing): see NewPresenterStep. */
const wantsPresenter = ref(false)
const hasPhoto = computed(() => portrait.value !== null)
const photoError = ref('')
watch(portrait, (file) => {
  draft.hadPhoto.value = file !== null
  if (file) photoError.value = ''
})
const photoLost = computed(() => draft.hadPhoto.value && !portrait.value)

// Provider defaults from the runtime config; applied once, unless a restored draft already holds the user's choice.
let webSearchApplied = draft.restored
watch(
  () => session.runtime?.config.WEB_GROUNDING,
  (value) => {
    if (webSearchApplied || value === undefined) return
    webSearchApplied = true
    options.value = { ...options.value, webSearch: Boolean(value) }
  },
  { immediate: true },
)

const pending = ref(false)
// Set while the language error is showing, so changing the language clears it.
const languageError = ref(false)
watch(
  () => options.value.language,
  () => {
    if (!languageError.value) return
    languageError.value = false
    error.value = ''
  },
)
const stage = ref<'' | 'documents' | 'outline' | 'photo'>('')
const error = ref('')
const hasTopic = computed(() => prompt.value.trim() !== '' || files.value.length > 0)
const hasTemplate = computed(() => !!chosen.value)
const canSubmit = computed(() => !pending.value && hasTopic.value && hasTemplate.value)

// --- Two steps, free to visit in either order: Topic, then Presenter. Creating needs a topic and a template. ---
type NewStepKey = Extract<WizardStepKey, 'topic' | 'presenter'>
const step = ref<NewStepKey>('topic')
const languageNeeded = computed(() => files.value.length > 0 && options.value.language === AUTO_LANGUAGE)

function clip(text: string, max = 44) {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}
const items = computed<WizardStepItem[]>(() => {
  const n = files.value.length
  const topic = prompt.value.trim() ? clip(prompt.value) : n ? t('views.new.documentCount', { count: n }, n) : ''
  const locked = (key: WizardStepKey, label: string): WizardStepItem => ({ key, label, summary: '', state: 'locked', reason: t('views.new.locked') })
  const mine = (key: NewStepKey, label: string, summary: string, done: boolean): WizardStepItem => ({
    key,
    label,
    summary,
    state: done && step.value !== key ? 'done' : 'available',
    reason: null,
  })
  return [
    mine('topic', t('views.new.steps.topic'), [topic, chosen.value?.name].filter(Boolean).join(' · '), hasTopic.value && hasTemplate.value),
    mine('presenter', t('views.new.steps.presenter'), presenterSummary(hasPhoto.value, wantsPresenter.value), false),
    locked('outline', t('views.new.steps.outline')),
    locked('preview', t('views.new.steps.preview')),
    locked('avatar', t('views.new.steps.narration')),
    locked('export', t('views.new.steps.export')),
  ]
})

const copy = computed<Record<NewStepKey, { heading: string; lede: string }>>(() => ({
  topic: { heading: t('views.new.copy.topicHeading'), lede: t('views.new.copy.topicLede') },
  presenter: { heading: t('views.new.copy.presenterHeading'), lede: t('views.new.copy.presenterLede') },
}))
const isStep = (key: WizardStepKey): key is NewStepKey => key === 'topic' || key === 'presenter'
const go = (to: NewStepKey) => {
  notice.clear()
  step.value = to
}
function onNavigate(dir: 'back' | 'next') {
  if (pending.value) return
  if (dir === 'back') go('topic')
  else if (hasTopic.value && hasTemplate.value) go('presenter')
}

// What Create outline is missing, in the order the user can fix it. Each one can take you to the thing to fix.
const composer = ref<InstanceType<typeof TopicComposer> | null>(null)
const look = ref<HTMLElement | null>(null)
const chips = ref<InstanceType<typeof NewSetupChips> | null>(null)
const blockers = computed(() => {
  const list: { id: 'topic' | 'look'; text: string }[] = []
  if (!hasTopic.value) list.push({ id: 'topic', text: t('views.new.blockers.topic') })
  if (!hasTemplate.value) list.push({ id: 'look', text: t('views.new.blockers.look') })
  return list
})
const notice = useFooterNotice()
/** Locked steps are closed until the outline exists; say what opens them, from wherever the user is. */
function explainLocked() {
  notice.show(step.value === 'presenter' ? t('views.new.lockedNotice.presenter') : t('views.new.lockedNotice.topic'))
}
/**
 * What Create outline will do, said before the click. It writes the outline only (no slides, voice or video yet); with
 * a presenter chosen but no photo it goes ahead voice-only, and says so.
 */
const footerStatus = computed(() => {
  if (pending.value) return stage.value ? t(`views.new.stage.${stage.value}`) : ''
  if (notice.text.value) return notice.text.value
  if (step.value !== 'presenter') return ''
  if (wantsPresenter.value && !hasPhoto.value) return t('views.new.status.noPhoto')
  const n = Number(options.value.slides)
  const scope = n > 0 ? t('views.new.status.outlineCount', { count: n }, n) : t('views.new.status.outlineAuto')
  return `${scope}. ${t('views.new.status.noSlidesYet')}`
})

/** Takes the user to the missing thing: the composer, or the template grid (scrolled into view, first card focused). */
async function fixMissing(id: 'topic' | 'look') {
  if (step.value !== 'topic') {
    step.value = 'topic'
    await nextTick()
    await nextTick()
  }
  if (id === 'topic') {
    composer.value?.focus()
    return
  }
  const grid = look.value
  if (!grid) return
  grid.scrollIntoView?.({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  await nextTick()
  const radios = Array.from(grid.querySelectorAll<HTMLElement>('[role="radio"]'))
  ;(radios.find((r) => r.getAttribute('aria-checked') === 'true') ?? radios[0])?.focus({ preventScroll: true })
}

async function submit() {
  if (!canSubmit.value) return
  const o = options.value
  if (files.value.length > 0 && o.language === AUTO_LANGUAGE) {
    languageError.value = true
    error.value = t('views.new.languageError')
    step.value = 'topic'
    await nextTick()
    await nextTick()
    await chips.value?.openLanguage()
    return
  }
  pending.value = true
  languageError.value = false
  error.value = ''
  try {
    let filePaths: string[] = []
    if (files.value.length > 0) {
      stage.value = 'documents'
      const documents = await uploadFiles(files.value)
      filePaths = documents.length > 0 ? await decomposeFiles(documents, o.language) : []
    }
    stage.value = 'outline'
    const slides = Number(o.slides)
    const created = await createPresentation({
      content: prompt.value,
      n_slides: slides > 0 ? slides : null,
      n_images: mediaCountForRequest(o.images),
      n_videos: mediaCountForRequest(effectiveVideos(o.videos, hasPhoto.value)),
      file_paths: filePaths,
      language: o.language,
      tone: o.tone,
      verbosity: o.verbosity,
      instructions: o.instructions.trim() || null,
      include_table_of_contents: o.includeTableOfContents,
      include_title_slide: o.includeTitleSlide,
      web_search: o.webSearch,
      // The backend calls template-based generation "standard".
      generation_mode: 'standard',
    })
    if (portrait.value) {
      stage.value = 'photo'
      try {
        await uploadPortrait(created.id, portrait.value)
      } catch {
        // The deck exists; the photo can be added in the Narration step.
        toast.error(t('views.new.photoUploadFailed'))
      }
    }
    // Each deck remembers its look: the Outline step finds it even when reached without the query.
    if (chosen.value) rememberDeckLook(created.id, { template: chosen.value.id })
    if (o.animate) {
      try {
        sessionStorage.setItem(animateFlagKey(created.id), '1')
      } catch {
        // Storage unavailable: the deck is generated without motion; it can be planned in the Motion tab.
      }
    }
    // Stay pending until the navigation settles; a failure leaves the draft intact.
    await router.push({ name: 'create', params: { id: created.id, step: 'outline' }, query: { ...(chosen.value && { template: chosen.value.id }) } })
    draft.clear()
  } catch (e) {
    error.value = describeError(t('views.new.startFailed'), e, t('views.new.startRetry'))
    pending.value = false
  }
}

// Next: Presenter (Topic step) or Create outline (Presenter step): from the primary, Enter in a field, or
// Ctrl/Cmd+Enter in the composer. When something is missing it takes you to the first missing thing instead.
function onCreate() {
  if (pending.value) return
  if (!hasTopic.value || !hasTemplate.value) {
    if (blockers.value[0]) void fixMissing(blockers.value[0].id)
  } else if (step.value === 'topic') go('presenter')
  else void submit()
}

watch(
  step,
  (now) => {
    // Two ticks: WizardLayout moves focus to its heading after one, and the composer must win.
    if (now === 'topic') void nextTick().then(() => nextTick(() => composer.value?.focus()))
  },
  { immediate: true },
)
</script>

<template>
  <WizardLayout
    :title="t('views.new.title')"
    :heading="copy[step].heading"
    :lede="copy[step].lede"
    :items="items"
    :current="step"
    @select="(k) => isStep(k) && !pending && go(k)"
    @blocked="explainLocked"
    @navigate="onNavigate"
  >
    <template v-if="step === 'topic'" #lead>
      <BrandLogo class="mb-5 h-6 w-auto" />
    </template>
    <form id="new-form" class="flex flex-col gap-6" @submit.prevent="onCreate">
      <template v-if="step === 'topic'">
      <section class="flex flex-col gap-3" aria-labelledby="new-topic-h">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 id="new-topic-h" class="flex items-center gap-2 text-[13px] font-medium text-tx-e4ecf0">
            <span class="grid size-5 place-items-center rounded-full bg-sx-bee3f31f text-[12px] font-semibold text-accent">1</span>
            {{ t('views.new.topicTitle') }}
          </h3>
          <span class="text-[12px] text-tx-8e9ca4">{{ t('views.new.topicHint') }}</span>
        </div>
        <TopicComposer ref="composer" v-model:prompt="prompt" v-model:files="files" :disabled="pending" @submit="onCreate" />
        <NewSetupChips ref="chips" v-model:options="options" :has-photo="hasPhoto" :disabled="pending" />
        <p v-if="filesLost" role="note" class="text-[12px] text-tx-a9c4d2">{{ t('views.new.filesLost') }}</p>
        <p v-if="languageNeeded" role="note" class="text-[12px] text-tx-a9c4d2">
          {{ t('views.new.languageNeeded') }}
          <button type="button" class="underline decoration-tx-bee3f366 underline-offset-[3px] hover:text-accent max-[559px]:inline-flex max-[559px]:min-h-11 max-[559px]:items-center" @click="chips?.openLanguage()">{{ t('views.new.chooseLanguage') }}</button>
        </p>
      </section>

      <section ref="look" class="flex flex-col gap-3 border-t border-ov/[0.06] pt-5" aria-labelledby="new-look-h">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 id="new-look-h" class="flex items-center gap-2 text-[13px] font-medium text-tx-e4ecf0">
            <span class="grid size-5 place-items-center rounded-full bg-sx-bee3f31f text-[12px] font-semibold text-accent">2</span>
            {{ t('views.new.lookTitle') }}
          </h3>
          <span class="text-[12px] text-tx-8e9ca4">{{ chosen ? chosen.name : t('views.new.lookPlaceholder') }}</span>
        </div>
        <Skeleton v-if="templates.isPending.value" class="h-[260px] w-full" />
        <Alert v-else-if="templates.isError.value" class="py-2 text-[12px]">{{ t('views.new.templatesFailed') }}</Alert>
        <NewTemplateSelector v-else-if="templates.data.value?.length" v-model="selectedTemplate" :templates="templates.data.value" :allow-later="false" :disabled="pending" />
        <Alert v-else class="py-2 text-[12px]">{{ t('views.new.noTemplates') }}</Alert>
      </section>
      </template>

      <NewPresenterStep v-else v-model="portrait" v-model:wants="wantsPresenter" v-model:options="options" :disabled="pending" :error="photoError" :photo-lost="photoLost" @error="photoError = $event" />
    </form>

    <template #footer>
      <WizardFooter :status="footerStatus" :error="error" :busy="pending">
        <template #back>
          <WizardBackButton v-if="step === 'presenter'" class="h-[43px] px-3 max-[559px]:h-11 max-[559px]:px-0" :disabled="pending" data-testid="wizard-back" @click="go('topic')" />
        </template>
        <template #primary>
          <Button
            v-if="step === 'presenter'"
            type="submit"
            form="new-form"
            data-testid="wizard-primary"
            class="h-[43px] min-w-[210px] px-4 text-[12px] max-[559px]:min-w-0"
            :class="pending && 'anim-working'"
            :disabled="!canSubmit"
          >
            <Sparkles class="size-[17px]" aria-hidden="true" />
            {{ pending ? t('views.new.working') : t('views.new.createOutline') }}
          </Button>
          <Button
            v-else
            type="submit"
            form="new-form"
            data-testid="wizard-primary"
            class="h-[43px] min-w-[210px] px-4 text-[12px] max-[559px]:min-w-0"
            :disabled="!canSubmit"
          >
            {{ t('views.new.nextPresenter') }}
            <ArrowRight class="size-4" aria-hidden="true" />
          </Button>
        </template>
        <template v-if="!pending && blockers.length && !notice.text.value" #status>
          <template v-for="(b, i) in blockers" :key="b.id">
            <span v-if="i > 0" aria-hidden="true"> · </span>
            <button type="button" :data-testid="`fix-${b.id}`" class="underline decoration-tx-bee3f366 underline-offset-[3px] hover:text-accent max-[559px]:inline-flex max-[559px]:min-h-11 max-[559px]:items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" @click="fixMissing(b.id)">{{ b.text }}</button>
          </template>
        </template>
      </WizardFooter>
    </template>
  </WizardLayout>
</template>
