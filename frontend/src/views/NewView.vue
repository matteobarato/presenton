<script setup lang="ts">
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useRoute, useRouter } from 'vue-router'
import { listTemplates, templatesKey } from '@/api/templates'
import { ApiError } from '@/api/errors'
import { decomposeFiles, uploadFiles } from '@/api/files'
import { createPresentation } from '@/api/generation'
import { rememberDeckLook } from '@/composables/useDeckLook'
import { useSessionStore } from '@/stores/session'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import GenerationOptions from '@/components/create/GenerationOptions.vue'
import NewTemplateSelector from '@/components/create/NewTemplateSelector.vue'
import ThemePicker from '@/components/create/ThemePicker.vue'
import TopicComposer from '@/components/create/TopicComposer.vue'
import WizardFooter from '@/components/create/wizard/WizardFooter.vue'
import WizardLayout from '@/components/create/wizard/WizardLayout.vue'
import { AVATAR_BADGE, avatarHint, type WizardStepItem, type WizardStepKey } from '@/components/create/wizard/progress'
import { useNewDraft } from '@/components/create/wizard/useNewDraft'
import { useThemeParam } from '@/composables/useThemeParam'
import { animateFlagKey, mediaCountForRequest, type CreateOptions } from '@/components/create/options'
import { AUTO_LANGUAGE } from '@/lib/languages'

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
const { themeList, isPending: themesPending, selectedThemeId, chosenTheme } = useThemeParam()
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
  animate: false,
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
watch(
  () => options.value.language,
  () => {
    if (error.value.startsWith('Choose a language')) error.value = ''
  },
)
const stage = ref('')
const error = ref('')
const hasTopic = computed(() => prompt.value.trim() !== '' || files.value.length > 0)
const hasTemplate = computed(() => !!chosen.value)
const canSubmit = computed(() => !pending.value && hasTopic.value && hasTemplate.value)

// --- Steps: free to visit in any order; creating needs a topic and a template. ---
type NewStepKey = Extract<WizardStepKey, 'topic' | 'look' | 'details'>
const ORDER: NewStepKey[] = ['topic', 'look', 'details']
const step = ref<NewStepKey>('topic')
const languageNeeded = computed(() => files.value.length > 0 && options.value.language === AUTO_LANGUAGE)

function mediaSummary(o: CreateOptions) {
  const images = o.images === '' ? 'Auto images' : o.images === '0' ? 'No images' : `${o.images} with images`
  if (o.videos === '' || o.videos === '0') return images
  return `${images} · ${o.videos} with presenter`
}
function clip(text: string, max = 44) {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}
const LOCKED = 'Create the outline first'
const items = computed<WizardStepItem[]>(() => {
  const o = options.value
  const n = files.value.length
  const topic = prompt.value.trim() ? clip(prompt.value) : n ? `${n} ${n === 1 ? 'document' : 'documents'}` : ''
  const mine = (key: NewStepKey, label: string, summary: string, done: boolean): WizardStepItem => ({
    key,
    label,
    summary,
    state: done && step.value !== key ? 'done' : 'available',
    reason: null,
    badge: null,
  })
  const locked = (key: WizardStepKey, label: string, badge: string | null = null): WizardStepItem => ({
    key,
    label,
    summary: '',
    state: 'locked',
    reason: LOCKED,
    badge,
  })
  return [
    mine('topic', 'Topic', topic, hasTopic.value),
    mine('look', 'Look', chosen.value?.name ?? '', hasTemplate.value),
    mine('details', 'Details', `${o.slides ? `${o.slides} slides` : 'Auto length'} · ${mediaSummary(o)}`, false),
    locked('outline', 'Outline'),
    locked('preview', 'Preview'),
    locked('avatar', 'Avatar', AVATAR_BADGE[avatarHint(o.videos)]),
    locked('export', 'Export'),
  ]
})

const copy: Record<NewStepKey, { heading: string; lede: string }> = {
  topic: {
    heading: 'Every great story starts somewhere.',
    lede: 'Say what it’s about, pick a look, tune the details. Next you’ll review the outline before any slides are made.',
  },
  look: { heading: 'Pick a look', lede: 'Choose a template for your slides. A theme can recolour it.' },
  details: { heading: 'Fine-tune the details', lede: 'The defaults work well. Change only what matters.' },
}

function isStep(key: WizardStepKey): key is NewStepKey {
  return (ORDER as string[]).includes(key)
}
function go(to: NewStepKey) {
  step.value = to
}
function advance() {
  if (step.value === 'topic') go('look')
  else if (step.value === 'look' && hasTemplate.value) go('details')
}
function back() {
  const i = ORDER.indexOf(step.value)
  if (i > 0) go(ORDER[i - 1]!)
}
function onNavigate(dir: 'back' | 'next') {
  if (pending.value) return
  if (dir === 'back') back()
  else advance()
}

// Why Create outline is unavailable, in the order the user can fix it.
const blockers = computed(() => {
  const list: { key: NewStepKey; text: string; action: string }[] = []
  if (!hasTopic.value) list.push({ key: 'topic', text: 'Add a topic or a document', action: 'Go to Topic' })
  if (!hasTemplate.value) list.push({ key: 'look', text: 'Pick a template', action: 'Go to Look' })
  return list
})
const footerStatus = computed(() => {
  if (pending.value) return stage.value
  if (step.value === 'look' && !hasTemplate.value) return 'Pick a template to continue'
  return ''
})

async function submit() {
  if (!canSubmit.value) return
  const o = options.value
  if (files.value.length > 0 && o.language === AUTO_LANGUAGE) {
    error.value = 'Choose a language before processing uploaded documents.'
    step.value = 'details'
    await nextTick()
    document.getElementById('opt-language')?.focus()
    return
  }
  pending.value = true
  error.value = ''
  try {
    let filePaths: string[] = []
    if (files.value.length > 0) {
      stage.value = 'Processing documents…'
      const documents = await uploadFiles(files.value)
      filePaths = documents.length > 0 ? await decomposeFiles(documents, o.language) : []
    }
    stage.value = 'Preparing outline…'
    const slides = Number(o.slides)
    const created = await createPresentation({
      content: prompt.value,
      n_slides: slides > 0 ? slides : null,
      n_images: mediaCountForRequest(o.images),
      n_videos: mediaCountForRequest(o.videos),
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
    // Each deck remembers its look: the Outline step finds it even when reached without the query.
    if (chosen.value) rememberDeckLook(created.id, { template: chosen.value.id, ...(chosenTheme.value && { theme: chosenTheme.value.id }) })
    if (o.animate) {
      try {
        sessionStorage.setItem(animateFlagKey(created.id), '1')
      } catch {
        // Storage unavailable: the deck is generated without motion; it can be planned in the Motion tab.
      }
    }
    // Stay pending until the navigation settles; a failure leaves the draft intact.
    await router.push({ name: 'create', params: { id: created.id, step: 'outline' }, query: { ...(chosen.value && { template: chosen.value.id }), ...(chosenTheme.value && { theme: chosenTheme.value.id }) } })
    draft.clear()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : e instanceof Error && e.message ? e.message : 'Something went wrong while starting your presentation.'
    pending.value = false
  }
}

// Enter in a field moves on; only the Details primary creates the deck.
function onFormSubmit() {
  if (step.value === 'details') void submit()
  else advance()
}
// Ctrl/Cmd+Enter in the composer creates the outline when it can, otherwise moves on.
function onComposerSubmit() {
  if (canSubmit.value) void submit()
  else advance()
}

const composer = ref<InstanceType<typeof TopicComposer> | null>(null)
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
    title="New presentation"
    :heading="copy[step].heading"
    :lede="copy[step].lede"
    :items="items"
    :current="step"
    @select="(k) => isStep(k) && !pending && go(k)"
    @navigate="onNavigate"
  >
    <form id="new-form" class="flex flex-col gap-5" @submit.prevent="onFormSubmit">
      <template v-if="step === 'topic'">
        <TopicComposer ref="composer" v-model:prompt="prompt" v-model:files="files" :disabled="pending" @submit="onComposerSubmit" />
        <p v-if="filesLost" role="note" class="-mt-1 text-[11px] text-[#a9c4d2]">Re-add your documents; files aren't kept after a reload.</p>
        <p v-if="languageNeeded" role="note" class="-mt-1 text-[11px] text-[#a9c4d2]">
          Documents need a language.
          <button type="button" class="underline decoration-[#bee3f366] underline-offset-[3px] hover:text-accent" @click="go('details')">Set it in Details</button>
        </p>
      </template>

      <template v-else-if="step === 'look'">
        <Skeleton v-if="templates.isPending.value" class="h-[260px] w-full" />
        <Alert v-else-if="templates.isError.value" class="py-2 text-[12px]">Templates couldn’t load. Reload the page to try again.</Alert>
        <NewTemplateSelector v-else-if="templates.data.value?.length" v-model="selectedTemplate" :templates="templates.data.value" :allow-later="false" :disabled="pending" :theme="chosenTheme" />
        <Alert v-else class="py-2 text-[12px]">No templates are available yet. Add one in Templates, then come back to create your outline.</Alert>
        <div class="mt-2 flex flex-col gap-3" data-testid="theme-row">
          <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 class="text-[13px] font-medium text-[#e4ecf0]">Theme</h3>
            <span class="text-[11px] text-[#8e9ca4]">Optional. Recolours the template.</span>
          </div>
          <Skeleton v-if="themesPending" class="h-[84px] w-full" />
          <ThemePicker v-else v-model="selectedThemeId" :themes="themeList" :disabled="pending" />
        </div>
      </template>

      <GenerationOptions v-else v-model="options" :disabled="pending" />
    </form>

    <template #footer>
      <WizardFooter :status="footerStatus" :error="error" :busy="pending">
        <template #back>
          <Button v-if="step !== 'topic'" type="button" variant="ghost" class="h-[43px] px-3" :disabled="pending" @click="back">
            <ArrowLeft class="size-4" aria-hidden="true" />
            Back
          </Button>
        </template>
        <template #primary>
          <Button
            v-if="step === 'details'"
            type="submit"
            form="new-form"
            data-testid="wizard-primary"
            class="h-[43px] min-w-[210px] px-4 text-[12px] max-[520px]:w-full max-[520px]:min-w-0"
            :class="pending && 'anim-working'"
            :disabled="!canSubmit"
          >
            <Sparkles class="size-[17px]" aria-hidden="true" />
            {{ pending ? 'Working…' : 'Create outline' }}
          </Button>
          <Button
            v-else
            type="button"
            variant="outline"
            data-testid="wizard-primary"
            class="h-[43px] px-4 max-[520px]:flex-1"
            :disabled="step === 'look' && !hasTemplate"
            @click="advance"
          >
            {{ step === 'topic' ? 'Choose a look' : 'Fine-tune details' }}
            <ArrowRight class="size-4" aria-hidden="true" />
          </Button>
        </template>
        <template v-if="step === 'details' && !pending && blockers.length" #status>
          <span v-for="b in blockers" :key="b.key" class="ml-3 inline-flex items-center gap-1.5">
            {{ b.text }}
            <button type="button" :data-testid="`fix-${b.key}`" class="underline decoration-[#bee3f366] underline-offset-[3px] hover:text-accent" @click="go(b.key)">{{ b.action }}</button>
          </span>
        </template>
      </WizardFooter>
    </template>
  </WizardLayout>
</template>
