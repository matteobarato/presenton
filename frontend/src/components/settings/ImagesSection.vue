<script setup lang="ts">
// Ported from servers/nextjs/app/(presentation-generator)/(dashboard)/settings/ImageProvider.tsx
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import ProviderPicker from '@/components/settings/ProviderPicker.vue'
import SecretInput from '@/components/settings/SecretInput.vue'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { DALLE_3_QUALITY_OPTIONS, GPT_IMAGE_1_5_QUALITY_OPTIONS, IMAGE_PROVIDERS, type ImageProviderRow, tx } from '@/settings/providers'
import type { ProviderConfig } from '@/settings/types'

const props = defineProps<{ config: ProviderConfig }>()
const emit = defineEmits<{ set: [field: string, value: unknown] }>()
const { t } = useI18n()

const uid = useId()
const id = (name: string) => `images-${uid}-${name}`

const OPTIONS = computed(() => IMAGE_PROVIDERS.map(({ value, label, description, icon }) => ({ value, label, description: tx(description), icon })))
const QUALITY: Record<string, { labelKey: string; field: string; fallback: string; options: { label: string; value: string }[] }> = {
  'dall-e-3': { labelKey: 'settings.images.quality.dalle3', field: 'DALL_E_3_QUALITY', fallback: 'standard', options: DALLE_3_QUALITY_OPTIONS },
  'gpt-image-1.5': {
    labelKey: 'settings.images.quality.gptImage15',
    field: 'GPT_IMAGE_1_5_QUALITY',
    fallback: 'low',
    options: GPT_IMAGE_1_5_QUALITY_OPTIONS,
  },
}
// Providers with a bespoke field set; every other row is a single API key.
const CUSTOM = ['comfyui', 'open_webui', 'openai_compatible']

const labelClass = 'mb-2 block text-[12px] font-medium text-tx-dbe7ef'
const selectClass =
  'flex h-9 w-full min-w-0 rounded-button border border-transparent bg-field px-3 text-[12px] text-tx-dce6ec transition-colors duration-200 hover:border-ov/15 focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40'
const linkClass =
  'mt-1.5 inline-block text-[11px] text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const managed = computed(() => props.config.LLM === 'presenton')
const enabled = computed(() => !props.config.DISABLE_IMAGE_GENERATION)
const row = computed<ImageProviderRow | undefined>(() => IMAGE_PROVIDERS.find((p) => p.value === props.config.IMAGE_PROVIDER))
const quality = computed(() => (row.value ? QUALITY[row.value.value] : undefined))
const keyRow = computed(() => (row.value && !CUSTOM.includes(row.value.value) && row.value.apiKeyField ? row.value : undefined))
const keyLabel = computed(() => tx(keyRow.value?.apiKeyFieldLabel) ?? t('settings.shared.apiKey'))

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
  <div v-if="managed" class="rounded-[11px] bg-sx-1d2427 px-4 py-3">
    <p class="text-[13px] font-medium text-tx-dbe7ef">{{ t('settings.images.managedTitle') }}</p>
    <p class="mt-0.5 text-[11px] leading-[1.6] text-tx-95aab7">{{ t('settings.images.managedHint') }}</p>
  </div>

  <div v-else class="grid gap-4">
    <div class="flex items-center gap-3">
      <Switch :id="id('enabled')" :model-value="enabled" @update:model-value="emit('set', 'DISABLE_IMAGE_GENERATION', !$event)" />
      <label :for="id('enabled')" class="text-[12px] font-medium text-tx-dbe7ef">{{ t('settings.images.generate') }}</label>
    </div>

    <template v-if="enabled">
      <ProviderPicker
        :model-value="row?.value ?? ''"
        :options="OPTIONS"
        :placeholder="t('settings.images.providerPlaceholder')"
        :search-placeholder="t('settings.images.providerSearch')"
        :label="t('settings.images.providerLabel')"
        @update:model-value="emit('set', 'IMAGE_PROVIDER', $event)"
      />

      <div v-if="keyRow" class="min-w-0">
        <SecretInput
          :model-value="text(keyRow.apiKeyField)"
          :label="keyLabel"
          :placeholder="t('settings.shared.enterYour', { name: keyLabel })"
          @update:model-value="emit('set', keyRow.apiKeyField!, $event)"
        />
        <a v-if="keyRow.getApiKeyUrl" :href="keyRow.getApiKeyUrl" target="_blank" rel="noopener noreferrer" :class="linkClass">{{ t('settings.shared.getApiKey') }}</a>
      </div>

      <div v-if="quality" class="min-w-0 sm:max-w-[240px]">
        <label :for="id('quality')" :class="labelClass">{{ t(quality.labelKey) }}</label>
        <select :id="id('quality')" :value="qualityValue()" :class="selectClass" @change="onQuality">
          <option v-for="o in quality.options" :key="o.value" :value="o.value">{{ tx(o.label) }}</option>
        </select>
      </div>

      <template v-if="row?.value === 'comfyui'">
        <div class="min-w-0">
          <label :for="id('comfyui-url')" :class="labelClass">{{ t('settings.images.comfyui.url') }}</label>
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
          <label :for="id('comfyui-workflow')" :class="labelClass">{{ t('settings.images.comfyui.workflow') }}</label>
          <Textarea
            :id="id('comfyui-workflow')"
            rows="3"
            spellcheck="false"
            class="font-mono text-[11px]"
            :placeholder="t('settings.images.comfyui.workflowPlaceholder')"
            :model-value="text('COMFYUI_WORKFLOW')"
            @update:model-value="emit('set', 'COMFYUI_WORKFLOW', String($event))"
          />
        </div>
      </template>

      <template v-else-if="row?.value === 'open_webui'">
        <div class="min-w-0">
          <label :for="id('webui-url')" :class="labelClass">{{ t('settings.images.webui.url') }}</label>
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
          :label="t('settings.images.webui.keyLabel')"
          optional
          :placeholder="t('settings.shared.apiKey')"
          @update:model-value="emit('set', 'OPEN_WEBUI_IMAGE_API_KEY', $event)"
        />
      </template>

      <template v-else-if="row?.value === 'openai_compatible'">
        <div class="min-w-0">
          <label :for="id('compat-url')" :class="labelClass">{{ t('settings.images.compat.url') }}</label>
          <Input
            :id="id('compat-url')"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            :placeholder="t('settings.images.compat.urlPlaceholder')"
            :model-value="text('OPENAI_COMPAT_IMAGE_BASE_URL')"
            @update:model-value="emit('set', 'OPENAI_COMPAT_IMAGE_BASE_URL', String($event))"
          />
        </div>
        <SecretInput
          :model-value="text('OPENAI_COMPAT_IMAGE_API_KEY')"
          :label="t('settings.images.compat.keyLabel')"
          :placeholder="t('settings.shared.enterYour', { name: 'API Key' })"
          @update:model-value="emit('set', 'OPENAI_COMPAT_IMAGE_API_KEY', $event)"
        />
        <div class="min-w-0">
          <label :for="id('compat-model')" :class="labelClass">{{ t('settings.images.compat.model') }}</label>
          <Input
            :id="id('compat-model')"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            :placeholder="t('settings.images.compat.modelPlaceholder')"
            :model-value="text('OPENAI_COMPAT_IMAGE_MODEL')"
            @update:model-value="emit('set', 'OPENAI_COMPAT_IMAGE_MODEL', String($event))"
          />
        </div>
      </template>
    </template>
  </div>
</template>
