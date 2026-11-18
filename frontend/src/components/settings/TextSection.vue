<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AdvancedTextSettings from '@/components/settings/AdvancedTextSettings.vue'
import ProviderFields from '@/components/settings/ProviderFields.vue'
import ProviderPicker from '@/components/settings/ProviderPicker.vue'
import SignInProviderNotice from '@/components/settings/SignInProviderNotice.vue'
import { Button } from '@/components/ui/button'
import { DEFAULT_OLLAMA_URL, SIGN_IN_PROVIDERS, TEXT_PROVIDERS, textProvider } from '@/settings/providers'
import type { ProviderConfig } from '@/settings/types'

const props = defineProps<{ config: ProviderConfig }>()
const emit = defineEmits<{ set: [field: string, value: unknown] }>()

const OPTIONS = TEXT_PROVIDERS.map(({ value, label, description, icon }) => ({ value, label, description, icon }))

const llm = computed(() => (typeof props.config.LLM === 'string' ? props.config.LLM : ''))
const signIn = computed(() => (llm.value === 'codex' || llm.value === 'presenton' ? SIGN_IN_PROVIDERS[llm.value] : undefined))
const row = computed(() => textProvider(llm.value))

// "Switch to another provider" reveals the picker; a draft that returns to a sign-in provider hides it again.
const switching = ref(false)
watch(signIn, (current) => {
  if (current) switching.value = false
})
const readOnly = computed(() => signIn.value !== undefined && !switching.value)

// Only ever a label, never a credential: the model for ChatGPT, the account email for Presenton Cloud.
const detail = computed(() => {
  const model = signIn.value?.modelField ? props.config[signIn.value.modelField] : undefined
  const email = llm.value === 'presenton' ? props.config.PRESENTON_EMAIL : undefined
  const shown = typeof model === 'string' && model.trim() ? model : typeof email === 'string' && email.trim() ? email : ''
  return shown || 'Connected account'
})

function pick(value: string) {
  switching.value = false
  emit('set', 'LLM', value)
  if (value === 'ollama' && !(typeof props.config.OLLAMA_URL === 'string' && props.config.OLLAMA_URL.trim())) {
    emit('set', 'OLLAMA_URL', DEFAULT_OLLAMA_URL)
  }
}
</script>

<template>
  <div class="grid gap-4">
    <div v-if="signIn && readOnly" class="grid gap-3">
      <div class="flex items-center gap-3 rounded-[11px] bg-[#1d2427] px-4 py-3">
        <img :src="signIn.icon" alt="" class="size-6 shrink-0 rounded-[4px] object-contain" />
        <div class="min-w-0">
          <p class="text-[13px] font-medium text-[#dbe7ef]">{{ signIn.label }}</p>
          <p class="mt-0.5 truncate text-[11px] text-[#95aab7]">{{ detail }}</p>
        </div>
      </div>
      <SignInProviderNotice />
      <div>
        <Button type="button" variant="secondary" @click="switching = true">Switch to another provider</Button>
      </div>
    </div>

    <template v-else>
      <div class="grid gap-2">
        <ProviderPicker
          :model-value="row?.value ?? ''"
          :options="OPTIONS"
          placeholder="Select text provider"
          search-placeholder="Search text providers"
          label="Text provider"
          @update:model-value="pick"
        />
        <SignInProviderNotice />
      </div>
      <ProviderFields v-if="row" :row="row" :config="config" @set="(f, v) => emit('set', f, v)" />
      <AdvancedTextSettings v-if="row" :config="config" @set="(f, v) => emit('set', f, v)" />
    </template>
  </div>
</template>
