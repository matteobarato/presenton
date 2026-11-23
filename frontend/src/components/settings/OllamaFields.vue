<script setup lang="ts">
// Ported from servers/nextjs/components/OllamaConfig.tsx
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Download, Loader2, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import {
  listOllamaLibrary,
  listReachableOllamaModels,
  pullOllamaModel,
  type OllamaLibraryModel,
  type OllamaModelInfo,
  type OllamaPullEvent,
} from '@/api/providerModels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { DEFAULT_OLLAMA_URL } from '@/settings/providers'
import type { ProviderConfig } from '@/settings/types'

const props = defineProps<{ config: ProviderConfig }>()
const emit = defineEmits<{ set: [field: string, value: unknown] }>()

const URL_FIELD = 'OLLAMA_URL'
const MODEL_FIELD = 'OLLAMA_MODEL'
const CONNECT_FALLBACK = 'Check the Ollama URL and try again.'
const UNEXPECTED_END = 'Pull ended unexpectedly. Check the model list and try again.'

function text(field: string): string {
  const value = props.config[field]
  return typeof value === 'string' ? value : ''
}
const url = computed(() => text(URL_FIELD))
const model = computed(() => text(MODEL_FIELD))

/** The thrown message only, ending in a full stop; nothing else is ever surfaced. */
function messageOf(error: unknown, fallback: string): string {
  const message = error instanceof Error && error.message.trim() ? error.message.trim() : fallback
  return /[.!?]$/.test(message) ? message : `${message}.`
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

// ---- Model discovery -------------------------------------------------------

const installed = ref<OllamaModelInfo[]>([])
const library = ref<OllamaLibraryModel[]>([])
const checked = ref(false)
const loading = ref(false)
const checkError = ref<string | null>(null)
const resolvedUrl = ref('')
let requestId = 0
// The URL our own check just wrote, so the watcher below does not mistake it for a user edit.
let expectedUrl: string | null = null

const installedNames = computed(() => new Set(installed.value.map((m) => m.name)))
const downloadable = computed(() => library.value.filter((m) => !installedNames.value.has(m.name)))
const libraryByName = computed(() => new Map(library.value.map((m) => [m.name, m])))

function modelLabel(m: OllamaModelInfo): string {
  const match = libraryByName.value.get(m.name)
  const parameters = m.parameters || match?.parameters || ''
  const size = match?.size || (m.size ? formatBytes(m.size) : '')
  return [m.name, parameters && !m.name.toLowerCase().endsWith(parameters.toLowerCase()) ? `(${parameters})` : '', size]
    .filter(Boolean)
    .join(' · ')
}

function resetResults(): void {
  requestId += 1
  installed.value = []
  library.value = []
  checked.value = false
  loading.value = false
  checkError.value = null
  resolvedUrl.value = ''
}

async function check(select?: string): Promise<void> {
  if (loading.value || pulling.value) return
  const id = ++requestId
  const requested = url.value.trim()
  loading.value = true
  checkError.value = null
  try {
    const [reachable, libraryModels] = await Promise.all([listReachableOllamaModels(requested), listOllamaLibrary()])
    if (id !== requestId) return
    installed.value = reachable.models
    library.value = libraryModels
    resolvedUrl.value = reachable.resolvedUrl
    checked.value = true

    if (reachable.resolvedUrl !== requested) {
      expectedUrl = reachable.resolvedUrl
      emit('set', URL_FIELD, reachable.resolvedUrl)
    }

    const names = reachable.models.map((m) => m.name)
    if (select && names.includes(select)) {
      emit('set', MODEL_FIELD, select)
    } else if (names.length > 0) {
      if (!names.includes(model.value)) emit('set', MODEL_FIELD, names[0])
    } else if (model.value !== '') {
      emit('set', MODEL_FIELD, '')
    }

    const more = libraryModels.filter((m) => !names.includes(m.name)).length
    toast.success('Connected to Ollama', {
      description:
        names.length > 0
          ? `Found ${names.length} downloaded model${names.length === 1 ? '' : 's'}. ${more} more available in library.`
          : 'Ollama is reachable. Browse the library to download models.',
    })
    if (reachable.usedFallback) {
      toast.success('Using in-container Ollama', {
        description: requested
          ? 'host.docker.internal did not respond, so the Ollama URL was switched to localhost.'
          : 'host.docker.internal did not respond, so this check used localhost.',
      })
    }
  } catch (error) {
    if (id !== requestId) return
    installed.value = []
    library.value = []
    resolvedUrl.value = ''
    checked.value = true
    const message = messageOf(error, CONNECT_FALLBACK)
    checkError.value = message
    emit('set', MODEL_FIELD, '')
    toast.error('Could not connect to Ollama', { description: `${message} Check the URL and try again.` })
  } finally {
    if (id === requestId) loading.value = false
  }
}

// ---- Pulling ---------------------------------------------------------------

type PullPhase = 'running' | 'done' | 'cancelled' | 'error'
interface PullState {
  name: string
  phase: PullPhase
  status: string
  percent: number | null
  completed: number | null
  total: number | null
  error: string | null
}

const pull = ref<PullState | null>(null)
const pulling = computed(() => pull.value?.phase === 'running')
let pullId = 0
let pullController: AbortController | null = null

function abortPull(): void {
  pullId += 1
  pullController?.abort()
  pullController = null
  pull.value = null
}

function percentOf(event: OllamaPullEvent): number | null {
  let value: number | null = null
  if (typeof event.progress === 'number') value = event.progress
  else if (typeof event.completed === 'number' && typeof event.total === 'number' && event.total > 0) {
    value = (event.completed / event.total) * 100
  }
  return value === null || Number.isNaN(value) ? null : Math.min(100, Math.max(0, value))
}

function markCancelled(): void {
  if (pull.value) {
    pull.value.phase = 'cancelled'
    pull.value.status = 'Pull cancelled.'
  }
  pullController = null
}

async function startPull(name: string): Promise<void> {
  if (pulling.value || loading.value) return
  const id = ++pullId
  const controller = new AbortController()
  pullController = controller
  pull.value = { name, phase: 'running', status: 'Starting pull…', percent: null, completed: null, total: null, error: null }
  const live = () => id === pullId && !controller.signal.aborted
  let terminal = false

  const onEvent = (event: OllamaPullEvent) => {
    const current = pull.value
    if (!live() || !current) return
    switch (event.type) {
      case 'status':
        current.status = event.status || 'Processing…'
        break
      case 'progress':
        current.status = event.status || 'Downloading…'
        current.percent = percentOf(event)
        current.completed = event.completed ?? null
        current.total = event.total ?? null
        break
      case 'complete':
        terminal = true
        current.phase = 'done'
        current.status = 'Model downloaded.'
        current.percent = 100
        pullController = null
        toast.success('Model downloaded', { description: `${name} is ready to use.` })
        void check(name)
        break
      case 'error':
        terminal = true
        current.phase = 'error'
        current.error = event.detail || 'Pull failed'
        pullController = null
        toast.error('Pull failed', { description: current.error })
        break
    }
  }

  try {
    await pullOllamaModel(name, url.value.trim() || resolvedUrl.value, onEvent, controller.signal)
  } catch (error) {
    if (id !== pullId) return
    if (controller.signal.aborted) {
      markCancelled()
      return
    }
    const message = messageOf(error, 'Pull failed')
    if (pull.value) {
      pull.value.phase = 'error'
      pull.value.error = message
    }
    pullController = null
    toast.error('Pull failed', { description: message })
    return
  }
  if (id !== pullId) return
  if (controller.signal.aborted) {
    markCancelled()
    return
  }
  if (!terminal && pull.value) {
    pull.value.phase = 'error'
    pull.value.error = UNEXPECTED_END
    pullController = null
  }
}

function cancelPull(): void {
  if (!pullController || !pull.value) return
  pull.value.status = 'Cancelling…'
  pullController.abort()
}

// ---- Wiring ----------------------------------------------------------------

function onUrlInput(value: string | number): void {
  expectedUrl = null
  abortPull()
  resetResults()
  emit('set', URL_FIELD, String(value))
  emit('set', MODEL_FIELD, '')
}

function onModelChange(event: Event): void {
  emit('set', MODEL_FIELD, (event.target as HTMLSelectElement).value)
}

// Anything that changes the URL other than our own check (typing aside, e.g. a discarded draft)
// invalidates what we know about the server.
watch(url, (next) => {
  if (expectedUrl !== null && next === expectedUrl) {
    expectedUrl = null
    return
  }
  expectedUrl = null
  abortPull()
  resetResults()
})

onBeforeUnmount(() => {
  requestId += 1
  abortPull()
})

const selected = computed(() => (installedNames.value.has(model.value) ? model.value : ''))
const pullPercent = computed(() => Math.round(pull.value?.percent ?? 0))
const pullBytes = computed(() =>
  pull.value && pull.value.completed !== null && pull.value.total !== null
    ? `${formatBytes(pull.value.completed)} / ${formatBytes(pull.value.total)}`
    : '',
)
const emptyMessage = computed(() =>
  downloadable.value.length > 0
    ? 'Ollama is reachable, but no models are installed. Download one below, then check again.'
    : 'Ollama is reachable, but no models are installed. Pull a model in Ollama, then check again.',
)
</script>

<template>
  <div class="grid min-w-0 gap-4">
    <div class="min-w-0">
      <label for="ollama-url" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">Ollama URL</label>
      <Input
        id="ollama-url"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        aria-describedby="ollama-url-help"
        :placeholder="DEFAULT_OLLAMA_URL"
        :model-value="url"
        @update:model-value="onUrlInput"
      />
      <p id="ollama-url-help" class="mt-1.5 text-[11px] text-tx-95aab7">
        Required for generation. Use {{ DEFAULT_OLLAMA_URL }}, or click Check models to detect localhost when Ollama runs in the same container.
      </p>
    </div>

    <div>
      <Button type="button" variant="secondary" :disabled="loading || pulling" @click="check()">
        <Loader2 v-if="loading" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {{ loading ? 'Checking for models…' : 'Check models' }}
      </Button>
    </div>

    <div v-if="checked && installed.length > 0" class="min-w-0">
      <label for="ollama-model" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">Choose an Ollama model</label>
      <select
        id="ollama-model"
        :value="selected"
        class="flex h-9 w-full min-w-0 rounded-button border border-transparent bg-field px-3 text-[12px] text-tx-dce6ec transition-colors duration-200 hover:border-white/15 focus-visible:border-accent focus-visible:outline-none"
        @change="onModelChange"
      >
        <option value="" disabled>Select a model</option>
        <option v-for="m in installed" :key="m.name" :value="m.name">{{ modelLabel(m) }}</option>
      </select>
    </div>

    <p v-if="checked && installed.length === 0 && checkError" class="text-[11px] text-tx-95aab7">{{ checkError }}</p>
    <p v-else-if="checked && installed.length === 0" class="text-[11px] text-tx-95aab7">{{ emptyMessage }}</p>

    <details v-if="checked && downloadable.length > 0" class="min-w-0">
      <summary
        class="mb-2 cursor-pointer text-[12px] font-medium text-tx-dbe7ef focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Available in library ({{ downloadable.length }})
      </summary>
      <ul class="grid max-h-72 gap-1.5 overflow-y-auto pr-1">
        <li
          v-for="m in downloadable"
          :key="m.name"
          class="flex min-w-0 items-center justify-between gap-3 rounded-button bg-field px-3 py-2"
        >
          <div class="min-w-0">
            <p class="truncate text-[12px] font-medium text-tx-dce6ec">
              {{ m.name }}<span v-if="m.parameters || m.size" class="text-tx-95aab7"> · {{ [m.parameters, m.size].filter(Boolean).join(' · ') }}</span>
            </p>
            <p v-if="m.description" class="truncate text-[11px] text-tx-95aab7">{{ m.description }}</p>
          </div>
          <Button type="button" size="sm" variant="outline" :aria-label="`Pull ${m.name}`" :disabled="pulling" @click="startPull(m.name)">
            <Download class="size-3.5" aria-hidden="true" />
            Pull
          </Button>
        </li>
      </ul>
    </details>

    <div v-if="pull" class="grid min-w-0 gap-2 rounded-button border border-white/[0.09] p-3">
      <template v-if="pull.phase === 'running'">
        <div class="flex items-center justify-between gap-2 text-[12px] text-tx-dce6ec">
          <span class="truncate" aria-live="polite">Downloading {{ pull.name }}: {{ pull.status }}</span>
          <span v-if="pull.percent !== null" class="shrink-0 font-medium">{{ pull.percent.toFixed(1) }}%</span>
        </div>
        <Progress :model-value="pullPercent" :max="100" :aria-label="`Downloading ${pull.name}`" />
        <p v-if="pullBytes" class="text-[11px] text-tx-95aab7">{{ pullBytes }}</p>
        <div>
          <Button type="button" size="sm" variant="outline" @click="cancelPull">
            <X class="size-3.5" aria-hidden="true" />
            Cancel
          </Button>
        </div>
      </template>
      <p v-else-if="pull.phase === 'error'" role="alert" class="text-[12px] text-tx-f0a3a3">
        {{ pull.name }}: {{ pull.error }}
      </p>
      <p v-else role="status" class="text-[12px] text-tx-dce6ec">
        <template v-if="pull.phase === 'done'">{{ pull.name }} has been downloaded and selected as your active model.</template>
        <template v-else>Download of {{ pull.name }} was cancelled.</template>
      </p>
    </div>
  </div>
</template>
