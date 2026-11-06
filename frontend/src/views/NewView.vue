<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '@/api/errors'
import { decomposeFiles, uploadFiles } from '@/api/files'
import { createPresentation } from '@/api/generation'
import { useSessionStore } from '@/stores/session'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import FileDropzone from '@/components/create/FileDropzone.vue'
import GenerationOptions from '@/components/create/GenerationOptions.vue'
import ModeSwitch from '@/components/create/ModeSwitch.vue'
import PromptField from '@/components/create/PromptField.vue'
import { type CreateMode, type CreateOptions } from '@/components/create/options'
import { AUTO_LANGUAGE } from '@/lib/languages'

const router = useRouter()
const session = useSessionStore()

const modes = computed<CreateMode[]>(() => {
  const m = session.runtime?.generationMode ?? 'both'
  return m === 'both' ? ['template', 'smart'] : [m]
})
const mode = ref<CreateMode>(modes.value[0])
watch(modes, (list) => {
  if (!list.includes(mode.value)) mode.value = list[0]
})

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
    stage.value = mode.value === 'smart' ? 'Starting Smart presentation…' : 'Preparing outline…'
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
      // The backend still calls Template mode "standard".
      generation_mode: mode.value === 'smart' ? 'smart' : 'standard',
    })
    // Stay pending until the navigation settles.
    await (mode.value === 'smart'
      ? router.push({ name: 'editor', params: { id: created.id }, query: { stream: '1' } })
      : router.push({ name: 'outline', params: { id: created.id } }))
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : e instanceof Error && e.message ? e.message : 'Something went wrong while starting your presentation.'
    pending.value = false
  }
}
</script>

<template>
  <main class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="font-display text-[26px] font-medium tracking-[-0.03em]">New presentation</h1>
      <ModeSwitch v-model="mode" :modes="modes" :disabled="pending" />
    </header>
    <form class="flex flex-col gap-5" @submit.prevent="submit">
      <PromptField v-model="prompt" :disabled="pending" />
      <FileDropzone v-model="files" :disabled="pending" />
      <GenerationOptions v-model="options" :disabled="pending" />
      <Alert v-if="error" variant="destructive" role="alert" class="py-2 text-[12px]">{{ error }}</Alert>
      <div class="flex items-center justify-end gap-3">
        <span v-if="pending" role="status" class="text-[12px] text-muted">{{ stage }}</span>
        <Button type="submit" :disabled="!canSubmit">{{ pending ? 'Working…' : 'Generate' }}</Button>
      </div>
    </form>
  </main>
</template>
