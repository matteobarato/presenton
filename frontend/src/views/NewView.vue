<script setup lang="ts">
import { ArrowRight, Sparkles } from 'lucide-vue-next'
import PageHeader from '@/components/shell/PageHeader.vue'
import { computed, ref, watch } from 'vue'
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
import FileDropzone from '@/components/create/FileDropzone.vue'
import GenerationOptions from '@/components/create/GenerationOptions.vue'
import NewTemplateSelector from '@/components/create/NewTemplateSelector.vue'
import PromptField from '@/components/create/PromptField.vue'
import { type CreateOptions } from '@/components/create/options'
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
const session = useSessionStore()

const prompt = ref('')
const files = ref<File[]>([])
const options = ref<CreateOptions>({
  slides: '',
  language: AUTO_LANGUAGE,
  tone: 'default',
  verbosity: 'standard',
  instructions: '',
  includeTitleSlide: false,
  includeTableOfContents: false,
  webSearch: false,
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
const stage = ref('')
const error = ref('')
const canSubmit = computed(() => !pending.value && (prompt.value.trim() !== '' || files.value.length > 0))

async function submit() {
  if (!canSubmit.value) return
  const o = options.value
  if (files.value.length > 0 && o.language === AUTO_LANGUAGE) {
    error.value = 'Choose a language before processing uploaded documents.'
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
    // Stay pending until the navigation settles.
    await router.push({ name: 'outline', params: { id: created.id }, query: chosen.value ? { template: chosen.value.id } : {} })
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : e instanceof Error && e.message ? e.message : 'Something went wrong while starting your presentation.'
    pending.value = false
  }
}
</script>

<template>
  <PageHeader title="New presentation" />
  <section class="workspace-card">
    <div class="mx-auto flex w-full max-w-[720px] flex-col">
      <header class="mb-9">
        <h1 class="text-[34px] leading-[1.22] font-medium tracking-[-0.04em] text-[#e4ecf0] max-[1050px]:text-[30px] max-[760px]:text-[27px]">
          Every great story starts somewhere.
        </h1>
        <p class="mt-[13px] text-[12px] text-[#9aabb4] max-[760px]:text-[11px] max-[760px]:leading-[1.7]">
          Tell us what’s on your mind. You’ll shape an outline and pick a template before any slides are made.
        </p>
      </header>
      <form class="flex flex-col gap-6" @submit.prevent="submit">
        <PromptField v-model="prompt" :disabled="pending" />
        <FileDropzone v-model="files" :disabled="pending" />
        <Skeleton v-if="templates.isPending.value" class="h-[260px] w-full" />
        <Alert v-else-if="templates.isError.value" class="py-2 text-[12px]">
          Templates couldn’t load. You can still pick one on the outline step.
        </Alert>
        <NewTemplateSelector v-else-if="templates.data.value?.length" v-model="selectedTemplate" :templates="templates.data.value" :disabled="pending" />
        <GenerationOptions v-model="options" :disabled="pending" />
        <Alert v-if="error" variant="destructive" role="alert" class="py-2 text-[12px]">{{ error }}</Alert>
        <div class="flex flex-col gap-3">
          <Button type="submit" class="h-[43px] w-full text-[12px]" :disabled="!canSubmit">
            <Sparkles class="mr-auto size-[17px]" aria-hidden="true" />
            {{ pending ? 'Working…' : 'Create my outline' }}
            <ArrowRight class="ml-auto size-[17px]" aria-hidden="true" />
          </Button>
          <span v-if="pending" role="status" class="text-center text-[11px] text-[#a2b7c5]">{{ stage }}</span>
        </div>
      </form>
    </div>
  </section>
</template>
