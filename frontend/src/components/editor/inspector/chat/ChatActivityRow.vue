<script setup lang="ts">
import { AlertCircle, Check, Info, Loader2 } from 'lucide-vue-next'
import type { ChatActivity } from '@/composables/useChat'

defineProps<{ item: ChatActivity }>()
</script>

<template>
  <li data-testid="chat-activity" :data-state="item.state" class="flex items-center gap-2 text-[11px] text-muted">
    <Loader2 v-if="item.state === 'running'" class="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
    <Check v-else-if="item.state === 'success'" class="size-3" aria-hidden="true" />
    <AlertCircle v-else-if="item.state === 'error'" class="size-3 text-danger-text" aria-hidden="true" />
    <Info v-else class="size-3" aria-hidden="true" />
    <span>{{ item.label }}</span>
  </li>
</template>
