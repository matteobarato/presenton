<script setup lang="ts">
import { computed, ref, toRef, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loader2 } from 'lucide-vue-next'
import BedrockFields from '@/components/settings/BedrockFields.vue'
import OllamaFields from '@/components/settings/OllamaFields.vue'
import ModelCombobox from '@/components/settings/ModelCombobox.vue'
import SecretInput from '@/components/settings/SecretInput.vue'
import VertexAzureFields from '@/components/settings/VertexAzureFields.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useModelDiscovery } from '@/composables/useModelDiscovery'
import { canDiscover, type TextProviderRow, tx } from '@/settings/providers'
import type { ProviderConfig } from '@/settings/types'

const props = defineProps<{ row: TextProviderRow; config: ProviderConfig }>()
const emit = defineEmits<{ set: [field: string, value: unknown] }>()
const { t } = useI18n()

// Rows with `fields` use a dedicated component; each entry maps the row to that component's props
// (every one emits `set: [field, value]`).
type DedicatedEntry = (row: TextProviderRow, config: ProviderConfig) => { component: Component; props: Record<string, unknown> }
const DEDICATED: Partial<Record<NonNullable<TextProviderRow['fields']>, DedicatedEntry>> = {
  'vertex-azure': (row, config) => ({ component: VertexAzureFields, props: { provider: row.value, config } }),
  bedrock: (_row, config) => ({ component: BedrockFields, props: { config } }),
  ollama: (_row, config) => ({ component: OllamaFields, props: { config } }),
}
const dedicated = computed(() => (props.row.fields ? DEDICATED[props.row.fields]?.(props.row, props.config) : undefined))

const { models, checked, loading, check } = useModelDiscovery({
  row: toRef(props, 'row'),
  config: toRef(props, 'config'),
  set: (field, value) => emit('set', field, value),
})

function text(field?: string): string {
  const value = field ? props.config[field] : undefined
  return typeof value === 'string' ? value : ''
}

const keyLabel = computed(() => tx(props.row.keyLabel) ?? t('settings.shared.apiKey'))
const keyPlaceholder = computed(
  () =>
    tx(props.row.keyPlaceholder) ??
    t('settings.shared.enterYour', { name: keyLabel.value.replace(/\s*\(optional\)$/i, '') }),
)
const urlLabel = computed(() => {
  const label = tx(props.row.urlLabel) ?? t('settings.providerFields.baseUrl')
  return props.row.urlOptional ? t('settings.shared.optionalLabel', { label }) : label
})
const urlPlaceholder = computed(() => tx(props.row.urlPlaceholder) ?? props.row.defaultUrl ?? '')
const discoverable = computed(() => canDiscover(props.row, props.config))
const modelValue = computed(() => text(props.row.modelField))
const showModels = computed(() => checked.value || modelValue.value !== '')

// An advanced URL starts open when it already has a value; the user's toggling is then respected.
const advancedOpen = ref(text(props.row.urlField) !== '')
watch(
  () => props.row.value,
  () => {
    advancedOpen.value = text(props.row.urlField) !== ''
  },
)
</script>

<template>
  <template v-if="row.fields">
    <component
      :is="dedicated.component"
      v-if="dedicated"
      :key="row.value"
      v-bind="dedicated.props"
      @set="(f: string, v: unknown) => emit('set', f, v)"
    />
  </template>

  <div v-else class="grid gap-4">
    <div v-if="row.keyField" class="min-w-0">
      <SecretInput
        :model-value="text(row.keyField)"
        :label="keyLabel"
        :optional="row.keyOptional"
        :placeholder="keyPlaceholder"
        @update:model-value="emit('set', row.keyField!, $event)"
      />
      <a
        v-if="row.getApiKeyUrl"
        :href="row.getApiKeyUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-1.5 inline-block text-[11px] text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >{{ t('settings.shared.getApiKey') }}</a
      >
    </div>

    <component :is="row.advancedUrl ? 'details' : 'div'" v-if="row.urlField" v-bind="row.advancedUrl ? { open: advancedOpen, onToggle: (e: Event) => (advancedOpen = (e.target as HTMLDetailsElement).open) } : {}" class="min-w-0">
      <summary
        v-if="row.advancedUrl"
        class="mb-2 cursor-pointer text-[12px] font-medium text-tx-dbe7ef focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {{ t('settings.shared.advancedSettings') }}
      </summary>
      <label :for="`url-${row.value}`" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ urlLabel }}</label>
      <Input
        :id="`url-${row.value}`"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :placeholder="urlPlaceholder"
        :model-value="text(row.urlField)"
        @update:model-value="emit('set', row.urlField!, String($event))"
      />
    </component>

    <div>
      <Button type="button" variant="secondary" :disabled="!discoverable || loading" @click="check">
        <Loader2 v-if="loading" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {{ loading ? t('settings.providerFields.checkingModels') : t('settings.providerFields.checkModels') }}
      </Button>
    </div>

    <template v-if="showModels">
      <ModelCombobox
        :model-value="modelValue"
        :options="models"
        :provider-label="row.label"
        @update:model-value="emit('set', row.modelField, $event)"
      />
      <p v-if="checked && models.length === 0" class="-mt-2 text-[11px] text-tx-95aab7">
        {{ t('settings.providerFields.noModelsFound') }}
      </p>
    </template>
  </div>
</template>
