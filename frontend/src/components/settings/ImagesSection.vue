<script setup lang="ts">
// Ported from servers/nextjs/app/(presentation-generator)/(dashboard)/settings/ImageProvider.tsx
import { computed, useId } from 'vue'
import ProviderPicker from '@/components/settings/ProviderPicker.vue'
import SecretInput from '@/components/settings/SecretInput.vue'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { DALLE_3_QUALITY_OPTIONS, GPT_IMAGE_1_5_QUALITY_OPTIONS, IMAGE_PROVIDERS, type ImageProviderRow } from '@/settings/providers'
import type { ProviderConfig } from '@/settings/types'

const props = defineProps<{ config: ProviderConfig }>()
const emit = defineEmits<{ set: [field: string, value: unknown] }>()

const uid = useId()
const id = (name: string) => `images-${uid}-${name}`

const OPTIONS = IMAGE_PROVIDERS.map(({ value, label, description, icon }) => ({ value, label, description, icon }))
const QUALITY: Record<string, { label: string; field: string; fallback: string; options: { label: string; value: string }[] }> = {
  'dall-e-3': { label: 'DALL·E 3 Image Quality', field: 'DALL_E_3_QUALITY', fallback: 'standard', options: DALLE_3_QUALITY_OPTIONS },
  'gpt-image-1.5': {
    label: 'GPT Image 1.5 Quality',
    field: 'GPT_IMAGE_1_5_QUALITY',
    fallback: 'low',
    options: GPT_IMAGE_1_5_QUALITY_OPTIONS,
  },
}
// Providers with a bespoke field set; every other row is a single API key.
const CUSTOM = ['comfyui', 'open_webui', 'openai_compatible']

const WORKFLOW_PLACEHOLDER = 'Paste your ComfyUI workflow JSON here (export via "Export (API)" in ComfyUI)'
const labelClass = 'mb-2 block text-[12px] font-medium text-[#dbe7ef]'
const selectClass =
  'flex h-9 w-full min-w-0 rounded-button border border-transparent bg-field px-3 text-[12px] text-[#dce6ec] transition-colors duration-200 hover:border-white/15 focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40'
const linkClass =
  'mt-1.5 inline-block text-[11px] text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const managed = computed(() => props.config.LLM === 'presenton')
const enabled = computed(() => !props.config.DISABLE_IMAGE_GENERATION)
const row = computed<ImageProviderRow | undefined>(() => IMAGE_PROVIDERS.find((p) => p.value === props.config.IMAGE_PROVIDER))
const quality = computed(() => (row.value ? QUALITY[row.value.value] : undefined))
const keyRow = computed(() => (row.value && !CUSTOM.includes(row.value.value) && row.value.apiKeyField ? row.value : undefined))

function text(field?: string): string {
  const value = field ? props.config[field] : undefined
  return typeof value === 'string' ? value : ''
}
function qualityValue(): string {
  return text(quality.value?.field) || quality.value?.fallback || ''
}
function onQuality(event: Event) {
  if (quality.value) emit('set', quality.value.field, (event.target as HTMLSelectElement).value)
}
</script>

<template>
  <div v-if="managed" class="rounded-[11px] bg-[#1d2427] px-4 py-3">
    <p class="text-[13px] font-medium text-[#dbe7ef]">Managed by Presenton Cloud</p>
    <p class="mt-0.5 text-[11px] leading-[1.6] text-[#95aab7]">Image generation is handled for you, so there is nothing to configure here.</p>
  </div>

  <div v-else class="grid gap-4">
    <div class="flex items-center gap-3">
      <Switch :id="id('enabled')" :model-value="enabled" @update:model-value="emit('set', 'DISABLE_IMAGE_GENERATION', !$event)" />
      <label :for="id('enabled')" class="text-[12px] font-medium text-[#dbe7ef]">Generate images</label>
    </div>

    <template v-if="enabled">
      <ProviderPicker
        :model-value="row?.value ?? ''"
        :options="OPTIONS"
        placeholder="Select image provider"
        search-placeholder="Search image providers"
        label="Image provider"
        @update:model-value="emit('set', 'IMAGE_PROVIDER', $event)"
      />

      <div v-if="keyRow" class="min-w-0">
        <SecretInput
          :model-value="text(keyRow.apiKeyField)"
          :label="keyRow.apiKeyFieldLabel ?? 'API key'"
          :placeholder="`Enter your ${keyRow.apiKeyFieldLabel ?? 'API key'}`"
          @update:model-value="emit('set', keyRow.apiKeyField!, $event)"
        />
        <a v-if="keyRow.getApiKeyUrl" :href="keyRow.getApiKeyUrl" target="_blank" rel="noopener noreferrer" :class="linkClass">Get an API key</a>
      </div>

      <div v-if="quality" class="min-w-0 sm:max-w-[240px]">
        <label :for="id('quality')" :class="labelClass">{{ quality.label }}</label>
        <select :id="id('quality')" :value="qualityValue()" :class="selectClass" @change="onQuality">
          <option v-for="o in quality.options" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>

      <template v-if="row?.value === 'comfyui'">
        <div class="min-w-0">
          <label :for="id('comfyui-url')" :class="labelClass">ComfyUI Server URL</label>
          <Input
            :id="id('comfyui-url')"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="http://192.168.1.7:8188"
            :model-value="text('COMFYUI_URL')"
            @update:model-value="emit('set', 'COMFYUI_URL', String($event))"
          />
        </div>
        <div class="min-w-0">
          <label :for="id('comfyui-workflow')" :class="labelClass">Workflow JSON</label>
          <Textarea
            :id="id('comfyui-workflow')"
            rows="3"
            spellcheck="false"
            class="font-mono text-[11px]"
            :placeholder="WORKFLOW_PLACEHOLDER"
            :model-value="text('COMFYUI_WORKFLOW')"
            @update:model-value="emit('set', 'COMFYUI_WORKFLOW', String($event))"
          />
        </div>
      </template>

      <template v-else-if="row?.value === 'open_webui'">
        <div class="min-w-0">
          <label :for="id('webui-url')" :class="labelClass">Open WebUI URL</label>
          <Input
            :id="id('webui-url')"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="http://localhost:3000/api/v1"
            :model-value="text('OPEN_WEBUI_IMAGE_URL')"
            @update:model-value="emit('set', 'OPEN_WEBUI_IMAGE_URL', String($event))"
          />
        </div>
        <SecretInput
          :model-value="text('OPEN_WEBUI_IMAGE_API_KEY')"
          label="API Key"
          optional
          placeholder="API key"
          @update:model-value="emit('set', 'OPEN_WEBUI_IMAGE_API_KEY', $event)"
        />
      </template>

      <template v-else-if="row?.value === 'openai_compatible'">
        <div class="min-w-0">
          <label :for="id('compat-url')" :class="labelClass">OpenAI Compatible URL</label>
          <Input
            :id="id('compat-url')"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="Enter your URL"
            :model-value="text('OPENAI_COMPAT_IMAGE_BASE_URL')"
            @update:model-value="emit('set', 'OPENAI_COMPAT_IMAGE_BASE_URL', String($event))"
          />
        </div>
        <SecretInput
          :model-value="text('OPENAI_COMPAT_IMAGE_API_KEY')"
          label="OpenAI Compatible API Key"
          placeholder="Enter your API Key"
          @update:model-value="emit('set', 'OPENAI_COMPAT_IMAGE_API_KEY', $event)"
        />
        <div class="min-w-0">
          <label :for="id('compat-model')" :class="labelClass">Image model id</label>
          <Input
            :id="id('compat-model')"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="e.g. dall-e-3, gpt-image-1"
            :model-value="text('OPENAI_COMPAT_IMAGE_MODEL')"
            @update:model-value="emit('set', 'OPENAI_COMPAT_IMAGE_MODEL', String($event))"
          />
        </div>
      </template>
    </template>
  </div>
</template>
