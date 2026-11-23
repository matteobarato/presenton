<script setup lang="ts">
import { computed } from 'vue'
import { imageSummary, isSecretKey, textSummary, webSearchSummary } from '@/settings/summary'
import type { ProviderConfig } from '@/settings/types'

const props = defineProps<{ mode: 'locked' | 'managed'; config: Record<string, unknown> }>()

const MESSAGES = {
  locked: 'Provider settings are locked by this deployment.',
  managed: 'An administrator manages these settings.',
}

// Defence in depth: the runtime config is already redacted, but no credential key is ever read.
const safe = computed<ProviderConfig>(() =>
  Object.fromEntries(Object.entries(props.config).filter(([key]) => !isSecretKey(key))),
)
const rows = computed(() => [
  { label: 'Text', value: textSummary(safe.value) },
  { label: 'Images', value: imageSummary(safe.value) },
  { label: 'Web search', value: webSearchSummary(safe.value) },
])
</script>

<template>
  <div>
    <p class="mb-5 text-[12px] text-tx-9aabb4">{{ MESSAGES[mode] }}</p>
    <dl class="grid gap-3">
      <div v-for="row in rows" :key="row.label" class="rounded-[11px] bg-sx-1d2427 px-4 py-3">
        <dt class="text-[10px] text-tx-95aab7">{{ row.label }}</dt>
        <dd class="mt-1.5 text-[13px] font-medium text-tx-dbe7ef">{{ row.value }}</dd>
      </div>
    </dl>
  </div>
</template>
