<script setup lang="ts">
// Ported from servers/nextjs/components/BedrockManualFields.tsx
import { ref, watch } from 'vue'
import SecretInput from '@/components/settings/SecretInput.vue'
import { Input } from '@/components/ui/input'
import type { ProviderConfig } from '@/settings/types'

const props = defineProps<{ config: ProviderConfig }>()
const emit = defineEmits<{ set: [field: string, value: unknown] }>()

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
      <label for="bedrock-model" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">Model</label>
      <Input
        id="bedrock-model"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="e.g. us.anthropic.claude-3-5-haiku-20241022-v1:0"
        :model-value="text('BEDROCK_MODEL')"
        @update:model-value="emit('set', 'BEDROCK_MODEL', String($event))"
      />
    </div>
    <div class="min-w-0">
      <label for="bedrock-region" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">Region</label>
      <Input
        id="bedrock-region"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="e.g. us-east-1"
        :model-value="text('BEDROCK_REGION')"
        @update:model-value="emit('set', 'BEDROCK_REGION', String($event))"
      />
    </div>
    <SecretInput
      :model-value="text('BEDROCK_API_KEY')"
      label="Bedrock API key (optional)"
      placeholder="Use this OR AWS access keys below"
      @update:model-value="emit('set', 'BEDROCK_API_KEY', $event)"
    />
    <div class="min-w-0">
      <label for="bedrock-access-key-id" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">AWS Access Key ID</label>
      <Input
        id="bedrock-access-key-id"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="Use with AWS Secret Access Key"
        :model-value="text('BEDROCK_AWS_ACCESS_KEY_ID')"
        @update:model-value="emit('set', 'BEDROCK_AWS_ACCESS_KEY_ID', String($event))"
      />
    </div>
    <SecretInput
      :model-value="text('BEDROCK_AWS_SECRET_ACCESS_KEY')"
      label="AWS Secret Access Key"
      placeholder="Use with AWS Access Key ID"
      @update:model-value="emit('set', 'BEDROCK_AWS_SECRET_ACCESS_KEY', $event)"
    />

    <p class="text-[11px] text-tx-95aab7">
      Authentication: set either Bedrock API key, or AWS access key ID + secret key.
    </p>

    <details
      class="min-w-0"
      :open="advancedOpen"
      @toggle="advancedOpen = ($event.target as HTMLDetailsElement).open"
    >
      <summary
        class="mb-2 cursor-pointer text-[12px] font-medium text-tx-dbe7ef focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Advanced settings
      </summary>
      <div class="grid gap-4">
        <SecretInput
          :model-value="text('BEDROCK_AWS_SESSION_TOKEN')"
          label="AWS Session Token"
          placeholder="Optional"
          @update:model-value="emit('set', 'BEDROCK_AWS_SESSION_TOKEN', $event)"
        />
        <div class="min-w-0">
          <label for="bedrock-profile-name" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">AWS Profile Name</label>
          <Input
            id="bedrock-profile-name"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="Optional"
            :model-value="text('BEDROCK_PROFILE_NAME')"
            @update:model-value="emit('set', 'BEDROCK_PROFILE_NAME', String($event))"
          />
        </div>
      </div>
    </details>
  </div>
</template>
