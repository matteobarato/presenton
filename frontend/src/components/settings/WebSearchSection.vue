<script setup lang="ts">
// Ported from servers/nextjs/app/(presentation-generator)/(dashboard)/settings/WebSearchProvider.tsx
import { computed, useId } from 'vue'
import ProviderPicker from '@/components/settings/ProviderPicker.vue'
import SecretInput from '@/components/settings/SecretInput.vue'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { WEB_SEARCH_PROVIDERS, type WebSearchProviderRow } from '@/settings/providers'
import type { ProviderConfig } from '@/settings/types'

const props = defineProps<{ config: ProviderConfig }>()
const emit = defineEmits<{ set: [field: string, value: unknown] }>()

const uid = useId()
const id = (name: string) => `web-search-${uid}-${name}`

const OPTIONS = WEB_SEARCH_PROVIDERS.map(({ value, label, description, icon }) => ({ value, label, description, icon }))
const DEFAULT_MAX_RESULTS = '5'
const labelClass = 'mb-2 block text-[12px] font-medium text-tx-dbe7ef'

const managed = computed(() => props.config.LLM === 'presenton')
const enabled = computed(() => !!props.config.WEB_GROUNDING)
const row = computed<WebSearchProviderRow | undefined>(() => {
  const selected = String(props.config.WEB_SEARCH_PROVIDER ?? '').toLowerCase()
  return WEB_SEARCH_PROVIDERS.find((p) => p.value === selected)
})
// Shown (never emitted) when nothing is stored; a cleared field stays empty so it can be retyped.
const maxResults = computed(() => {
  const value = props.config.WEB_SEARCH_MAX_RESULTS as unknown
  return value === undefined || value === null ? DEFAULT_MAX_RESULTS : String(value)
})

function text(field?: string): string {
  const value = field ? props.config[field] : undefined
  return typeof value === 'string' ? value : ''
}

// Turning web search on without a usable provider falls back to "auto", as the old settings page did.
// This runs from the user's toggle only, never on mount.
function onToggle(checked: boolean) {
  emit('set', 'WEB_GROUNDING', checked)
  if (checked && !row.value) emit('set', 'WEB_SEARCH_PROVIDER', 'auto')
}
</script>

<template>
  <div v-if="managed" class="rounded-[11px] bg-sx-1d2427 px-4 py-3">
    <p class="text-[13px] font-medium text-tx-dbe7ef">Managed by Presenton Cloud</p>
    <p class="mt-0.5 text-[11px] leading-[1.6] text-tx-95aab7">Web search is handled for you, so there is nothing to configure here.</p>
  </div>

  <div v-else class="grid gap-4">
    <div class="flex items-center gap-3">
      <Switch :id="id('enabled')" :model-value="enabled" @update:model-value="onToggle($event)" />
      <label :for="id('enabled')" class="text-[12px] font-medium text-tx-dbe7ef">Web search</label>
    </div>

    <template v-if="enabled">
      <ProviderPicker
        :model-value="row?.value ?? ''"
        :options="OPTIONS"
        placeholder="Select web search provider"
        search-placeholder="Search web search providers"
        label="Web search provider"
        @update:model-value="emit('set', 'WEB_SEARCH_PROVIDER', $event)"
      />

      <p v-if="row?.value === 'auto'" class="rounded-[11px] bg-sx-1d2427 px-4 py-3 text-[11px] leading-[1.6] text-tx-95aab7">
        Model-native web grounding is preferred when available. Otherwise, external search fallback is used.
      </p>

      <div v-if="row?.urlField" class="min-w-0">
        <label :for="id('url')" :class="labelClass">{{ row?.urlLabel }}</label>
        <Input
          :id="id('url')"
          type="text"
          inputmode="url"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="https://search.example.com"
          :model-value="text(row?.urlField)"
          @update:model-value="emit('set', row.urlField!, String($event))"
        />
      </div>

      <SecretInput
        v-if="row?.apiKeyField"
        :model-value="text(row?.apiKeyField)"
        :label="row?.apiKeyLabel ?? 'API key'"
        @update:model-value="emit('set', row.apiKeyField!, $event)"
      />

      <div v-if="row && row.value !== 'auto'" class="min-w-0 sm:max-w-[240px]">
        <label :for="id('max-results')" :class="labelClass">Maximum results</label>
        <Input
          :id="id('max-results')"
          type="number"
          min="1"
          max="10"
          step="1"
          inputmode="numeric"
          :placeholder="DEFAULT_MAX_RESULTS"
          :model-value="maxResults"
          @update:model-value="emit('set', 'WEB_SEARCH_MAX_RESULTS', String($event))"
        />
      </div>
    </template>
  </div>
</template>
