<script setup lang="ts">
// Ported from servers/nextjs/components/BedrockManualFields.tsx
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SecretInput from '@/components/settings/SecretInput.vue'
import { Input } from '@/components/ui/input'
import type { ProviderConfig } from '@/settings/types'

const props = defineProps<{ config: ProviderConfig }>()
const emit = defineEmits<{ set: [field: string, value: unknown] }>()
const { t } = useI18n()

function text(field: string): string {
  const value = props.config[field]
  return typeof value === 'string' ? value : ''
}

const hasAdvancedContent = () => text('BEDROCK_AWS_SESSION_TOKEN').trim() !== '' || text('BEDROCK_PROFILE_NAME').trim() !== ''

// Starts open when it already has a value, and opens when one arrives later; the user can still toggle it.
const advancedOpen = ref(hasAdvancedContent())
watch(
  () => [text('BEDROCK_AWS_SESSION_TOKEN'), text('BEDROCK_PROFILE_NAME')],
  () => {
    if (hasAdvancedContent()) advancedOpen.value = true
  },
)
</script>

<template>
  <div class="grid min-w-0 gap-4">
    <div class="min-w-0">
      <label for="bedrock-model" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ t('settings.bedrock.model') }}</label>
      <Input
        id="bedrock-model"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :placeholder="t('settings.bedrock.modelPlaceholder')"
        :model-value="text('BEDROCK_MODEL')"
        @update:model-value="emit('set', 'BEDROCK_MODEL', String($event))"
      />
    </div>
    <div class="min-w-0">
      <label for="bedrock-region" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ t('settings.bedrock.region') }}</label>
      <Input
        id="bedrock-region"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :placeholder="t('settings.bedrock.regionPlaceholder')"
        :model-value="text('BEDROCK_REGION')"
        @update:model-value="emit('set', 'BEDROCK_REGION', String($event))"
      />
    </div>
    <SecretInput
      :model-value="text('BEDROCK_API_KEY')"
      :label="t('settings.bedrock.apiKeyLabel')"
      :placeholder="t('settings.bedrock.apiKeyPlaceholder')"
      @update:model-value="emit('set', 'BEDROCK_API_KEY', $event)"
    />
    <div class="min-w-0">
      <label for="bedrock-access-key-id" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ t('settings.bedrock.accessKeyId') }}</label>
      <Input
        id="bedrock-access-key-id"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :placeholder="t('settings.bedrock.accessKeyIdPlaceholder')"
        :model-value="text('BEDROCK_AWS_ACCESS_KEY_ID')"
        @update:model-value="emit('set', 'BEDROCK_AWS_ACCESS_KEY_ID', String($event))"
      />
    </div>
    <SecretInput
      :model-value="text('BEDROCK_AWS_SECRET_ACCESS_KEY')"
      :label="t('settings.bedrock.secretAccessKey')"
      :placeholder="t('settings.bedrock.secretAccessKeyPlaceholder')"
      @update:model-value="emit('set', 'BEDROCK_AWS_SECRET_ACCESS_KEY', $event)"
    />

    <p class="text-[11px] text-tx-95aab7">
      {{ t('settings.bedrock.authHint') }}
    </p>

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
        <SecretInput
          :model-value="text('BEDROCK_AWS_SESSION_TOKEN')"
          :label="t('settings.bedrock.sessionToken')"
          :placeholder="t('settings.shared.optional')"
          @update:model-value="emit('set', 'BEDROCK_AWS_SESSION_TOKEN', $event)"
        />
        <div class="min-w-0">
          <label for="bedrock-profile-name" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ t('settings.bedrock.profileName') }}</label>
          <Input
            id="bedrock-profile-name"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            :placeholder="t('settings.shared.optional')"
            :model-value="text('BEDROCK_PROFILE_NAME')"
            @update:model-value="emit('set', 'BEDROCK_PROFILE_NAME', String($event))"
          />
        </div>
      </div>
    </details>
  </div>
</template>
