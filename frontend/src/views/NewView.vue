<script setup lang="ts">
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-vue-next'
import PageHeader from '@/components/shell/PageHeader.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useRoute, useRouter } from 'vue-router'
import { listTemplates, templatesKey } from '@/api/templates'
import { ApiError } from '@/api/errors'
import { decomposeFiles, uploadFiles } from '@/api/files'
import { createPresentation } from '@/api/generation'
import { useSessionStore } from '@/stores/session'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import GenerationOptions from '@/components/create/GenerationOptions.vue'
import NewSteps, { type StepItem } from '@/components/create/NewSteps.vue'
import NewTemplateSelector from '@/components/create/NewTemplateSelector.vue'
import ThemePicker from '@/components/create/ThemePicker.vue'
import TopicComposer from '@/components/create/TopicComposer.vue'
import { useThemeParam } from '@/composables/useThemeParam'
import { animateFlagKey, mediaCountForRequest, TONES, VERBOSITIES, type CreateOptions } from '@/components/create/options'
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

// Provider defaults from the runtime config; applied once, then the user is in charge.
let webSearchApplied = false
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
const canSubmit = computed(() => !pending.value && hasTopic.value)

// --- Steps: free to visit in any order; only submitting needs a topic. ---
const STEP_TOPIC = 0
const STEP_LOOK = 1
const STEP_DETAILS = 2
const step = ref(STEP_TOPIC)
const composer = ref<InstanceType<typeof TopicComposer> | null>(null)
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
const steps = computed<StepItem[]>(() => {
  const o = options.value
  const n = files.value.length
  const topic = prompt.value.trim() ? clip(prompt.value) : n ? `${n} ${n === 1 ? 'document' : 'documents'}` : 'Not written yet'
  const tone = TONES.find((t) => t.value === o.tone)?.label ?? 'Default'
  const verbosity = VERBOSITIES.find((v) => v.value === o.verbosity)?.label ?? 'Standard'
  return [
    { key: 'topic', label: 'Topic', value: topic, done: hasTopic.value },
    { key: 'look', label: 'Look', value: chosen.value?.name ?? 'Decide later', done: !!chosen.value },
    {
      key: 'details',
      label: 'Details',
      value: `${o.slides ? `${o.slides} slides` : 'Auto length'} · ${mediaSummary(o)} · ${tone} · ${verbosity}`,
      done: step.value > STEP_DETAILS,
    },
  ]
})
const isLast = computed(() => step.value === STEP_DETAILS)
const nextLabel = computed(() => (step.value === STEP_TOPIC ? 'Choose a look' : 'Fine-tune details'))

function go(to: number) {
  step.value = Math.max(STEP_TOPIC, Math.min(STEP_DETAILS, to))
}
watch(step, (now) => {
  if (now === STEP_TOPIC) void nextTick(() => composer.value?.focus())
})

async function submit() {
  if (!canSubmit.value) return
  const o = options.value
  if (files.value.length > 0 && o.language === AUTO_LANGUAGE) {
    error.value = 'Choose a language before processing uploaded documents.'
    step.value = STEP_DETAILS
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
    if (o.animate) {
      try {
        sessionStorage.setItem(animateFlagKey(created.id), '1')
      } catch {
        // Storage unavailable: the deck is generated without motion; it can be planned in the Motion tab.
      }
    }
    // Stay pending until the navigation settles.
    await router.push({ name: 'create', params: { id: created.id, step: 'outline' }, query: { ...(chosen.value && { template: chosen.value.id }), ...(chosenTheme.value && { theme: chosenTheme.value.id }) } })
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : e instanceof Error && e.message ? e.message : 'Something went wrong while starting your presentation.'
    pending.value = false
  }
}
</script>

<template>
  <PageHeader title="New presentation" />
  <section class="workspace-card">
    <form class="mx-auto flex min-h-full w-full max-w-[880px] flex-col" @submit.prevent="submit">
      <header class="mb-7 max-[760px]:mb-5">
        <h1 class="text-[30px] leading-[1.22] font-medium tracking-[-0.04em] text-balance text-[#e4ecf0] max-[1050px]:text-[27px] max-[760px]:text-[24px]">
          Every great story starts somewhere.
        </h1>
        <p class="mt-[11px] max-w-[60ch] text-[12px] leading-[1.7] text-[#9aabb4] max-[760px]:text-[11px]">
          Say what it’s about, pick a look, tune the details, in any order. Next you’ll review the outline before any slides are made.
        </p>
      </header>

      <NewSteps v-model="step" :steps="steps" :disabled="pending" />

      <div class="relative mt-7 flex-1 max-[760px]:mt-5">
        <Transition name="step-panel">
          <section v-show="step === STEP_TOPIC" aria-labelledby="step-topic-title" class="flex flex-col gap-5">
            <h2 id="step-topic-title" class="text-[16px] font-medium tracking-[-0.02em] text-[#e4ecf0]">What is your presentation about?</h2>
            <TopicComposer ref="composer" v-model:prompt="prompt" v-model:files="files" :disabled="pending" @submit="submit" />
            <p v-if="languageNeeded" role="status" class="-mt-1 text-[11px] text-[#a9c4d2]">
              Documents need a language.
              <button type="button" class="underline decoration-[#bee3f366] underline-offset-[3px] hover:text-accent" @click="go(STEP_DETAILS)">Set it in Details</button>
            </p>
          </section>
        </Transition>

        <Transition name="step-panel">
          <section v-show="step === STEP_LOOK" aria-labelledby="step-look-title" class="flex flex-col gap-5">
            <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="step-look-title" class="text-[16px] font-medium tracking-[-0.02em] text-[#e4ecf0]">Pick a look</h2>
              <span class="text-[11px] text-[#8e9ca4]">Optional. You can change it on the outline step.</span>
            </div>
            <Skeleton v-if="templates.isPending.value" class="h-[260px] w-full" />
            <Alert v-else-if="templates.isError.value" class="py-2 text-[12px]">
              Templates couldn’t load. You can still pick one on the outline step.
            </Alert>
            <NewTemplateSelector v-else-if="templates.data.value?.length" v-model="selectedTemplate" :templates="templates.data.value" :disabled="pending" :theme="chosenTheme" />
            <div class="mt-2 flex flex-col gap-3" data-testid="theme-row">
              <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 class="text-[13px] font-medium text-[#e4ecf0]">Theme</h3>
                <span class="text-[11px] text-[#8e9ca4]">Optional. Recolours the template.</span>
              </div>
              <Skeleton v-if="themesPending" class="h-[84px] w-full" />
              <ThemePicker v-else v-model="selectedThemeId" :themes="themeList" :disabled="pending" />
            </div>
          </section>
        </Transition>

        <Transition name="step-panel">
          <section v-show="step === STEP_DETAILS" aria-labelledby="step-details-title" class="flex flex-col gap-6">
            <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="step-details-title" class="text-[16px] font-medium tracking-[-0.02em] text-[#e4ecf0]">Fine-tune the details</h2>
              <span class="text-[11px] text-[#8e9ca4]">The defaults work well. Change only what matters.</span>
            </div>
            <GenerationOptions v-model="options" :disabled="pending" />
          </section>
        </Transition>
      </div>

      <div
        class="sticky bottom-[-44px] z-10 mt-8 -mx-3 flex flex-col gap-2.5 rounded-t-[14px] bg-[#191d1fee] px-3 pt-4 pb-[44px] backdrop-blur-[10px] max-[1050px]:bottom-[-38px] max-[1050px]:pb-[38px] max-[760px]:bottom-[-30px] max-[760px]:pb-[30px] max-[450px]:bottom-[-27px] max-[450px]:pb-[27px]"
      >
        <Alert v-if="error" variant="destructive" role="alert" class="py-2 text-[12px]">{{ error }}</Alert>
        <div class="flex items-center gap-2.5 max-[520px]:flex-wrap">
          <Button v-if="step > STEP_TOPIC" type="button" variant="ghost" class="h-[43px] px-3" :disabled="pending" @click="go(step - 1)">
            <ArrowLeft class="size-4" aria-hidden="true" />
            Back
          </Button>
          <span class="flex-1 max-[520px]:hidden" />
          <Button v-if="!isLast" type="button" variant="outline" class="h-[43px] px-4 max-[520px]:flex-1" :disabled="pending" @click="go(step + 1)">
            {{ nextLabel }}
            <ArrowRight class="size-4" aria-hidden="true" />
          </Button>
          <Button type="submit" class="h-[43px] min-w-[210px] px-4 text-[12px] max-[520px]:w-full max-[520px]:min-w-0" :class="pending && 'anim-working'" :disabled="!canSubmit">
            <Sparkles class="size-[17px]" aria-hidden="true" />
            {{ pending ? 'Working…' : 'Create my outline' }}
          </Button>
        </div>
        <span v-if="pending" role="status" class="text-right text-[11px] text-[#a2b7c5] max-[520px]:text-center">{{ stage }}</span>
        <span v-else-if="!hasTopic && step !== STEP_TOPIC" class="text-right text-[11px] text-[#8e9ca4] max-[520px]:text-center">
          Add a topic or a document to create your outline.
        </span>
      </div>
    </form>
  </section>
</template>
