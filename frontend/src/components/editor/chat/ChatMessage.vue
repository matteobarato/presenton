<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMsg } from '@/composables/useChat'
import { renderMarkdown } from '@/lib/mini-markdown'

const props = defineProps<{ message: ChatMsg }>()
const html = computed(() => (props.message.role === 'assistant' ? renderMarkdown(props.message.content) : ''))
</script>

<template>
  <div
    data-testid="chat-message"
    :data-role="message.role"
    :class="[
      'max-w-[92%] rounded-xl px-3 py-2 text-[12px] leading-[1.6]',
      message.role === 'user' && 'ml-auto bg-secondary text-secondary-text',
      message.role === 'assistant' && 'mr-auto bg-field text-tx-dce6ec',
      message.role === 'error' && 'mr-auto bg-danger text-danger-text',
    ]"
  >
    <!-- eslint-disable-next-line vue/no-v-html -- sanitised by renderMarkdown (DOMPurify) -->
    <div v-if="message.role === 'assistant'" class="chat-md" v-html="html" />
    <p v-else class="whitespace-pre-wrap" :role="message.role === 'error' ? 'alert' : undefined">{{ message.content }}</p>
    <p v-if="message.stopped" class="mt-1 text-[10px] text-muted">Stopped</p>
  </div>
</template>

<style scoped>
.chat-md :deep(p + p),
.chat-md :deep(ul),
.chat-md :deep(ol),
.chat-md :deep(pre) {
  margin-top: 0.5em;
}
.chat-md :deep(ul) { list-style: disc; padding-left: 1.2em; }
.chat-md :deep(ol) { list-style: decimal; padding-left: 1.2em; }
.chat-md :deep(code) { font-family: ui-monospace, monospace; font-size: 11px; background: #0003; padding: 0 3px; border-radius: 4px; }
.chat-md :deep(pre) { overflow-x: auto; background: #0004; padding: 8px; border-radius: 8px; }
.chat-md :deep(pre code) { background: none; padding: 0; }
.chat-md :deep(a) { text-decoration: underline; }
.chat-md :deep(table) { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; font-size: 11px; }
.chat-md :deep(th), .chat-md :deep(td) { border: 1px solid #ffffff17; padding: 5px 9px; text-align: left; vertical-align: top; }
.chat-md :deep(th) { background: #ffffff0a; color: #eef5f9; font-weight: 600; }
.chat-md :deep(th[align=center]), .chat-md :deep(td[align=center]) { text-align: center; }
.chat-md :deep(th[align=right]), .chat-md :deep(td[align=right]) { text-align: right; font-variant-numeric: tabular-nums; }
</style>
