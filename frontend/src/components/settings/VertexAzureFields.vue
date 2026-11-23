<script setup lang="ts">
// Ported from servers/nextjs/components/VertexAzureManualFields.tsx
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SecretInput from '@/components/settings/SecretInput.vue'
import { Input } from '@/components/ui/input'
import type { ProviderConfig } from '@/settings/types'

const props = defineProps<{ provider: 'vertex' | 'azure'; config: ProviderConfig }>()
const emit = defineEmits<{ set: [field: string, value: unknown] }>()
const { t } = useI18n()

function text(field: string): string {
  const value = props.config[field]
  return typeof value === 'string' ? value : ''
}
function has(field: string): boolean {
  return text(field).trim() !== ''
}

const hasAdvancedContent = () => has('VERTEX_PROJECT') || has('VERTEX_LOCATION') || has('VERTEX_BASE_URL')

// Starts open when it already has a value, and opens when one arrives later; the user can still toggle it.
const advancedOpen = ref(hasAdvancedContent())
watch(
  () => [text('VERTEX_PROJECT'), text('VERTEX_LOCATION'), text('VERTEX_BASE_URL')],
  () => {
    if (hasAdvancedContent()) advancedOpen.value = true
  },
)

const keyField = computed(() => (props.provider === 'vertex' ? 'VERTEX_API_KEY' : 'AZURE_OPENAI_API_KEY'))
const keyLabel = computed(() => (props.provider === 'vertex' ? t('settings.vertex.keyLabel') : t('settings.vertex.azureKeyLabel')))
</script>

<template>
  <div class="grid min-w-0 gap-4">
    <SecretInput
      :id="`${provider}-api-key`"
      :model-value="text(keyField)"
      :label="keyLabel"
      :placeholder="t('settings.shared.enterYour', { name: keyLabel })"
      @update:model-value="emit('set', keyField, $event)"
    />

    <template v-if="provider === 'vertex'">
      <div class="min-w-0">
        <label for="vertex-model" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ t('settings.vertex.model') }}</label>
        <Input
          id="vertex-model"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :placeholder="t('settings.vertex.modelPlaceholder')"
          :model-value="text('VERTEX_MODEL')"
          @update:model-value="emit('set', 'VERTEX_MODEL', String($event))"
        />
      </div>

      <details
        class="min-w-0"
        :open="advancedOpen"
        @toggle="advancedOpen = ($event.target as HTMLDetailsElement).open"
      >
        <summary
          class="mb-2 cursor-pointer text-[12px] font-medium text-tx-dbe7ef focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {{ t('settings.shared.advancedSettings') }}
        </summary>
        <div class="grid gap-4">
          <div class="min-w-0">
            <label for="vertex-project" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ t('settings.vertex.projectId') }}</label>
            <Input
              id="vertex-project"
              type="text"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              :placeholder="t('settings.shared.optional')"
              :model-value="text('VERTEX_PROJECT')"
              @update:model-value="emit('set', 'VERTEX_PROJECT', String($event))"
            />
          </div>
          <div class="min-w-0">
            <label for="vertex-location" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ t('settings.vertex.region') }}</label>
            <Input
              id="vertex-location"
              type="text"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              :placeholder="t('settings.vertex.regionPlaceholder')"
              :model-value="text('VERTEX_LOCATION')"
              @update:model-value="emit('set', 'VERTEX_LOCATION', String($event))"
            />
          </div>
          <div class="min-w-0">
            <label for="vertex-base-url" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ t('settings.vertex.customEndpoint') }}</label>
            <Input
              id="vertex-base-url"
              type="text"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              :placeholder="t('settings.shared.optional')"
              :model-value="text('VERTEX_BASE_URL')"
              @update:model-value="emit('set', 'VERTEX_BASE_URL', String($event))"
            />
          </div>
        </div>
      </details>
    </template>

    <template v-else>
      <div class="min-w-0">
        <label for="azure-endpoint" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ t('settings.vertex.azureEndpoint') }}</label>
        <Input
          id="azure-endpoint"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="https://your-resource.openai.azure.com"
          :model-value="text('AZURE_OPENAI_ENDPOINT')"
          @update:model-value="emit('set', 'AZURE_OPENAI_ENDPOINT', String($event))"
        />
      </div>
      <div class="min-w-0">
        <label for="azure-model" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ t('settings.vertex.azureModel') }}</label>
        <Input
          id="azure-model"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :placeholder="t('settings.vertex.azureModelPlaceholder')"
          :model-value="text('AZURE_OPENAI_MODEL')"
          @update:model-value="emit('set', 'AZURE_OPENAI_MODEL', String($event))"
        />
      </div>
      <div class="min-w-0">
        <label for="azure-api-version" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ t('settings.vertex.apiVersion') }}</label>
        <Input
          id="azure-api-version"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :placeholder="t('settings.vertex.apiVersionPlaceholder')"
          :model-value="text('AZURE_OPENAI_API_VERSION')"
          @update:model-value="emit('set', 'AZURE_OPENAI_API_VERSION', String($event))"
        />
      </div>
    </template>
  </div>
</template>
