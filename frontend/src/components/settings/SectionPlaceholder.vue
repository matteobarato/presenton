<script setup lang="ts">
import type { ProviderConfig } from '@/settings/types'

// Temporary: replaced by the real section components in later tasks.
defineProps<{ config: ProviderConfig }>()
defineEmits<{ set: [field: string, value: unknown] }>()
</script>

<template>
  <p class="text-[12px] text-[#9aabb4]">Coming in this slice</p>
</template>
