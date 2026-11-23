<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { imageSummary, isSecretKey, textSummary, webSearchSummary } from '@/settings/summary'
import type { ProviderConfig } from '@/settings/types'

const props = defineProps<{ mode: 'locked' | 'managed'; config: Record<string, unknown> }>()

const { t } = useI18n()

const MESSAGES = {
  locked: 'settings.readOnly.locked',
  managed: 'settings.readOnly.managed',
} as const

// Defence in depth: the runtime config is already redacted, but no credential key is ever read.
const safe = computed<ProviderConfig>(() =>
  Object.fromEntries(Object.entries(props.config).filter(([key]) => !isSecretKey(key))),
)
const rows = computed(() => [
  { label: t('settings.readOnly.text'), value: textSummary(safe.value) },
  { label: t('settings.readOnly.images'), value: imageSummary(safe.value) },
  { label: t('settings.readOnly.webSearch'), value: webSearchSummary(safe.value) },
])
</script>

<template>
  <div>
    <p class="mb-5 text-[12px] text-tx-9aabb4">{{ t(MESSAGES[mode]) }}</p>
    <dl class="grid gap-3">
      <div v-for="row in rows" :key="row.label" class="rounded-[11px] bg-sx-1d2427 px-4 py-3">
        <dt class="text-[10px] text-tx-95aab7">{{ row.label }}</dt>
        <dd class="mt-1.5 text-[13px] font-medium text-tx-dbe7ef">{{ row.value }}</dd>
      </div>
    </dl>
  </div>
</template>
