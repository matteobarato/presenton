<script setup lang="ts">
// Ported from servers/nextjs/components/AdvancedTextProviderSettings.tsx
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { ChevronDown, ChevronUp, Loader2, RotateCcw, Trash2 } from 'lucide-vue-next'
import { getGenerationDefaults, listOpenRouterProviders } from '@/api/providerModels'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { textProvider } from '@/settings/providers'
import type { ProviderConfig } from '@/settings/types'

const props = defineProps<{ config: ProviderConfig }>()
const emit = defineEmits<{ set: [field: string, value: unknown] }>()

interface SelectOption {
  value: string
  label: string
}

const FALLBACK_DEFAULT_MAX_OUTPUT_TOKENS = 8192
const DEFAULTS_DEBOUNCE_MS = 500
const MODEL_DEFAULT = 'model_default'

const REASONING_MODE_OPTIONS: SelectOption[] = [
  { value: MODEL_DEFAULT, label: 'Model default' },
  { value: 'enabled', label: 'On' },
  { value: 'disabled', label: 'Off' },
]
const REASONING_EFFORT_OPTIONS: SelectOption[] = [
  { value: MODEL_DEFAULT, label: 'Model default' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
  { value: 'max', label: 'Maximum' },
]
const FLAG_OPTIONS: SelectOption[] = [
  { value: '', label: 'Default' },
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
]
const DATA_COLLECTION_OPTIONS: SelectOption[] = [
  { value: '', label: 'Default' },
  { value: 'allow', label: 'Allow' },
  { value: 'deny', label: 'Deny' },
]

const uid = useId()
const id = (name: string) => `${uid}-${name}`

const selectClass =
  'flex h-9 w-full min-w-0 rounded-button border border-transparent bg-field px-3 text-[12px] text-[#dce6ec] transition-colors duration-200 hover:border-white/15 focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40'
const labelClass = 'mb-2 block text-[12px] font-medium text-[#dbe7ef]'
const helpClass = 'mt-1.5 text-[11px] leading-5 text-[#95aab7]'

// ---- Config readers ---------------------------------------------------------

function text(field: string): string {
  const value = props.config[field]
  return typeof value === 'string' ? value : ''
}
const llm = computed(() => text('LLM'))
const modelField = computed(() => textProvider(llm.value)?.modelField)
const selectedModel = computed(() => (modelField.value ? text(modelField.value) : ''))

const rawLimit = computed(() => props.config.LLM_MAX_OUTPUT_TOKENS as unknown)
const limitText = computed(() => (typeof rawLimit.value === 'number' || typeof rawLimit.value === 'string' ? String(rawLimit.value) : ''))
const hasManualLimit = computed(() => {
  const n = Number(limitText.value)
  return limitText.value.trim() !== '' && Number.isFinite(n) && n > 0
})
const useModelMaximum = computed(() => props.config.LLM_GENERATION_PROFILE === 'model_max' && !hasManualLimit.value)

const reasoningMode = computed(() => {
  const mode = props.config.LLM_REASONING_MODE
  return mode === 'enabled' || mode === 'disabled' ? mode : MODEL_DEFAULT
})
const reasoningEffort = computed(() => {
  const effort = props.config.LLM_REASONING_EFFORT as unknown
  return typeof effort !== 'string' || effort === '' || effort === 'default' || effort === 'none' ? MODEL_DEFAULT : effort
})

function flag(field: string): string {
  const value = props.config[field] as unknown
  if (value === true || value === 'true') return 'true'
  if (value === false || value === 'false') return 'false'
  return ''
}
const dataCollection = computed(() => {
  const value = props.config.OPENROUTER_DATA_COLLECTION as unknown
  return value === 'allow' || value === 'deny' ? value : ''
})
const order = computed<string[]>(() => {
  const value = props.config.OPENROUTER_PROVIDER_ORDER as unknown
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
})

// ---- Token defaults (placeholder only; never written to the draft) -----------

const defaultMaxOutputTokens = ref(FALLBACK_DEFAULT_MAX_OUTPUT_TOKENS)
let defaultsRequest = 0
let defaultsTimer: ReturnType<typeof setTimeout> | undefined

async function loadDefaults(): Promise<void> {
  const request = ++defaultsRequest
  try {
    const defaults = await getGenerationDefaults()
    if (request === defaultsRequest) defaultMaxOutputTokens.value = defaults.defaultMaxOutputTokens
  } catch {
    // The placeholder keeps its current value.
  }
}

onMounted(() => void loadDefaults())
watch([llm, selectedModel], () => {
  defaultsRequest += 1
  clearTimeout(defaultsTimer)
  defaultsTimer = setTimeout(() => void loadDefaults(), DEFAULTS_DEBOUNCE_MS)
})

// ---- Generation controls ---------------------------------------------------

function onModelMaximum(checked: boolean | 'indeterminate'): void {
  emit('set', 'LLM_GENERATION_PROFILE', checked === true ? 'model_max' : '')
  emit('set', 'LLM_MAX_OUTPUT_TOKENS', '')
}

function onLimitInput(value: string | number): void {
  // A legacy preset is dropped as soon as a manual limit is typed.
  if (props.config.LLM_GENERATION_PROFILE) emit('set', 'LLM_GENERATION_PROFILE', '')
  emit('set', 'LLM_MAX_OUTPUT_TOKENS', String(value))
}

function onReasoningMode(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  emit('set', 'LLM_REASONING_MODE', value === MODEL_DEFAULT ? '' : value)
  if (value === 'disabled') {
    emit('set', 'LLM_REASONING_EFFORT', '')
    emit('set', 'LLM_REASONING_BUDGET_TOKENS', '')
  } else if (props.config.LLM_REASONING_EFFORT === 'none') {
    emit('set', 'LLM_REASONING_EFFORT', '')
  }
}

function onReasoningEffort(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  emit('set', 'LLM_REASONING_EFFORT', value === MODEL_DEFAULT ? '' : value)
}

// ---- OpenRouter routing ------------------------------------------------------

function onFlag(field: string, event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  emit('set', field, value === '' ? '' : value === 'true')
}

function onDataCollection(event: Event): void {
  emit('set', 'OPENROUTER_DATA_COLLECTION', (event.target as HTMLSelectElement).value)
}

const available = ref<string[]>([])
const loaded = ref(false)
const providersLoading = ref(false)
const providersMessage = ref<string | null>(null)
let providersRequest = 0

const chips = computed(() => available.value.filter((p) => !order.value.includes(p)))
const providerInputs = computed(() => [text('OPENROUTER_MODEL'), text('OPENROUTER_API_KEY'), text('OPENROUTER_BASE_URL')])

function resetProviders(): void {
  providersRequest += 1
  available.value = []
  loaded.value = false
  providersLoading.value = false
  providersMessage.value = null
}

// A list fetched for another model, key or base URL says nothing about this one.
watch(() => providerInputs.value.join('\u0000'), resetProviders)

async function loadProviders(): Promise<void> {
  const [model, apiKey, baseUrl] = providerInputs.value
  if (!model.trim() || !apiKey.trim()) {
    providersMessage.value = 'Enter an OpenRouter model and API key first.'
    return
  }
  const request = ++providersRequest
  providersLoading.value = true
  providersMessage.value = null
  try {
    const providers = await listOpenRouterProviders({ model, apiKey, baseUrl: baseUrl || undefined })
    if (request !== providersRequest) return
    available.value = providers
    loaded.value = true
  } catch {
    if (request !== providersRequest) return
    // Never surface the thrown message: it can echo the request.
    providersMessage.value = 'Could not load providers.'
  } finally {
    if (request === providersRequest) providersLoading.value = false
  }
}

function addProvider(value: string): void {
  if (!order.value.includes(value)) emit('set', 'OPENROUTER_PROVIDER_ORDER', [...order.value, value])
}

function move(index: number, direction: -1 | 1): void {
  const target = index + direction
  if (target < 0 || target >= order.value.length) return
  const next = [...order.value]
  ;[next[index], next[target]] = [next[target], next[index]]
  emit('set', 'OPENROUTER_PROVIDER_ORDER', next)
}

function remove(value: string): void {
  emit('set', 'OPENROUTER_PROVIDER_ORDER', order.value.filter((item) => item !== value))
}

// ---- Reset -------------------------------------------------------------------

const RESET_FIELDS = [
  'LLM_GENERATION_PROFILE',
  'LLM_MAX_OUTPUT_TOKENS',
  'LLM_REASONING_MODE',
  'LLM_REASONING_EFFORT',
  'LLM_REASONING_BUDGET_TOKENS',
  'DISABLE_THINKING',
  'EXTENDED_REASONING',
  'OPENROUTER_PROVIDER_ORDER',
  'OPENROUTER_ALLOW_FALLBACKS',
  'OPENROUTER_REQUIRE_PARAMETERS',
  'OPENROUTER_DATA_COLLECTION',
  'OPENROUTER_ZDR',
]

function resetToDefaults(): void {
  for (const field of RESET_FIELDS) emit('set', field, field === 'OPENROUTER_PROVIDER_ORDER' ? [] : '')
}

onBeforeUnmount(() => {
  defaultsRequest += 1
  providersRequest += 1
  clearTimeout(defaultsTimer)
})
</script>

<template>
  <details class="group min-w-0">
    <summary
      class="flex cursor-pointer list-none items-center justify-between gap-4 rounded-button border border-white/[0.09] px-4 py-3 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"
    >
      <span class="min-w-0">
        <span class="block text-[12px] font-medium text-[#dbe7ef]">
          Advanced text-provider settings <span class="font-normal text-[#95aab7]">(optional)</span>
        </span>
        <span class="mt-0.5 block text-[11px] text-[#95aab7]">Configure output limits and reasoning behaviour when needed.</span>
      </span>
      <ChevronDown class="size-4 shrink-0 text-[#95aab7] transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
    </summary>

    <div class="mt-4 grid min-w-0 gap-5">
      <div class="flex justify-end">
        <Button type="button" size="sm" variant="outline" @click="resetToDefaults">
          <RotateCcw class="size-3.5" aria-hidden="true" />
          Reset to defaults
        </Button>
      </div>

      <section class="grid min-w-0 gap-4" :aria-labelledby="id('generation-heading')">
        <div>
          <h4 :id="id('generation-heading')" class="text-[12px] font-semibold text-[#dbe7ef]">Generation controls</h4>
          <p :class="helpClass" class="!mt-1">Set an output limit and control reasoning for supported models.</p>
        </div>

        <div class="min-w-0">
          <label :for="id('limit')" :class="labelClass">Max output tokens</label>
          <Input
            :id="id('limit')"
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            :aria-describedby="id('limit-help')"
            :disabled="useModelMaximum"
            :placeholder="useModelMaximum ? 'Model maximum' : String(defaultMaxOutputTokens)"
            :model-value="useModelMaximum ? '' : limitText"
            @update:model-value="onLimitInput"
          />
          <div class="mt-3 flex items-center gap-2">
            <Checkbox :id="id('model-max')" :model-value="useModelMaximum" @update:model-value="onModelMaximum" />
            <label :for="id('model-max')" class="cursor-pointer text-[12px] font-medium text-[#dbe7ef]">
              Use the selected model's maximum output limit
            </label>
          </div>
          <p :id="id('limit-help')" :class="helpClass">
            Leave blank to use the default, enter a manual limit, or select model maximum to use the selected model's advertised limit.
            The selected limit applies to every generation attempt, including retries.
            <template v-if="!hasManualLimit && !useModelMaximum"> The effective default is shown in the field.</template>
          </p>
        </div>

        <div class="grid min-w-0 gap-4 sm:grid-cols-2">
          <div class="min-w-0">
            <label :for="id('reasoning-mode')" :class="labelClass">Reasoning mode</label>
            <select :id="id('reasoning-mode')" :value="reasoningMode" :class="selectClass" @change="onReasoningMode">
              <option v-for="o in REASONING_MODE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <p :class="helpClass">Use the backend model default, force reasoning on, or turn it off for faster responses.</p>
          </div>
          <div v-if="reasoningMode !== 'disabled'" class="min-w-0">
            <label :for="id('reasoning-effort')" :class="labelClass">Reasoning effort</label>
            <select :id="id('reasoning-effort')" :value="reasoningEffort" :class="selectClass" @change="onReasoningEffort">
              <option v-for="o in REASONING_EFFORT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <p :class="helpClass">Higher effort may improve difficult generations, but can increase latency and token usage.</p>
          </div>
        </div>
      </section>

      <section v-if="llm === 'openrouter'" class="grid min-w-0 gap-4" :aria-labelledby="id('routing-heading')">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 :id="id('routing-heading')" class="text-[12px] font-semibold text-[#dbe7ef]">OpenRouter routing</h4>
            <p :class="helpClass" class="!mt-1">Leave the order empty to let OpenRouter route automatically.</p>
          </div>
          <Button type="button" size="sm" variant="secondary" :disabled="providersLoading" @click="loadProviders">
            <Loader2 v-if="providersLoading" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {{ providersLoading ? 'Loading…' : 'Load providers' }}
          </Button>
        </div>

        <p v-if="providersMessage" role="alert" class="text-[11px] text-[#f0a3a3]">{{ providersMessage }}</p>

        <div v-if="chips.length > 0" class="flex flex-wrap gap-1.5">
          <Button v-for="p in chips" :key="p" type="button" size="sm" variant="outline" :aria-label="`Add ${p}`" @click="addProvider(p)">
            + {{ p }}
          </Button>
        </div>
        <p v-else-if="loaded" class="text-[11px] text-[#95aab7]">No further providers are available for this model.</p>

        <ul v-if="order.length > 0" class="grid gap-1.5" aria-label="Provider order">
          <li v-for="(p, index) in order" :key="p" class="flex min-w-0 items-center gap-1 rounded-button bg-field px-3 py-1.5">
            <span class="min-w-0 flex-1 truncate text-[12px] text-[#dce6ec]">
              {{ p }}<span v-if="loaded && !available.includes(p)" class="text-[#95aab7]"> (unverified)</span>
            </span>
            <Button type="button" size="icon" variant="ghost" class="size-7" :aria-label="`Move ${p} up`" :disabled="index === 0" @click="move(index, -1)">
              <ChevronUp class="size-4" aria-hidden="true" />
            </Button>
            <Button type="button" size="icon" variant="ghost" class="size-7" :aria-label="`Move ${p} down`" :disabled="index === order.length - 1" @click="move(index, 1)">
              <ChevronDown class="size-4" aria-hidden="true" />
            </Button>
            <Button type="button" size="icon" variant="ghost" class="size-7" :aria-label="`Remove ${p}`" @click="remove(p)">
              <Trash2 class="size-4" aria-hidden="true" />
            </Button>
          </li>
        </ul>

        <div class="grid min-w-0 gap-4 sm:grid-cols-2">
          <div class="min-w-0">
            <label :for="id('fallbacks')" :class="labelClass">Allow fallbacks</label>
            <select :id="id('fallbacks')" :value="flag('OPENROUTER_ALLOW_FALLBACKS')" :class="selectClass" @change="onFlag('OPENROUTER_ALLOW_FALLBACKS', $event)">
              <option v-for="o in FLAG_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
          <div class="min-w-0">
            <label :for="id('require-parameters')" :class="labelClass">Require parameters</label>
            <select :id="id('require-parameters')" :value="flag('OPENROUTER_REQUIRE_PARAMETERS')" :class="selectClass" @change="onFlag('OPENROUTER_REQUIRE_PARAMETERS', $event)">
              <option v-for="o in FLAG_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
          <div class="min-w-0">
            <label :for="id('data-collection')" :class="labelClass">Data collection</label>
            <select :id="id('data-collection')" :value="dataCollection" :class="selectClass" @change="onDataCollection">
              <option v-for="o in DATA_COLLECTION_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
          <div class="min-w-0">
            <label :for="id('zdr')" :class="labelClass">Zero data retention (ZDR)</label>
            <select :id="id('zdr')" :value="flag('OPENROUTER_ZDR')" :class="selectClass" @change="onFlag('OPENROUTER_ZDR', $event)">
              <option v-for="o in FLAG_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
        </div>
      </section>
    </div>
  </details>
</template>
