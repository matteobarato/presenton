<script setup lang="ts">
import { computed, nextTick, onMounted, ref, toRef, watch } from 'vue'
import { Send, Square } from 'lucide-vue-next'
import { toast } from '@/components/ui/sonner'
import type { Presentation, Slide } from '@/api/types'
import { useChat } from '@/composables/useChat'
import { useEditorStore } from '@/stores/editor'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import ChatMessage from './chat/ChatMessage.vue'
import ChatActivityRow from './chat/ChatActivityRow.vue'
import ConversationMenu from './chat/ConversationMenu.vue'

const props = defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const editor = useEditorStore()
const chat = useChat(toRef(props, 'presentationId'))
const draft = ref('')
const list = ref<HTMLElement | null>(null)
const busyLabel = computed(() => chat.status.value || 'Working on it')

onMounted(() => void chat.loadHistory())

watch(
  () => [chat.messages.value.length, chat.messages.value.at(-1)?.content, chat.activity.value.length],
  async () => {
    await nextTick()
    if (list.value) list.value.scrollTop = list.value.scrollHeight
  },
)

function submit() {
  const text = draft.value.trim()
  if (!text || chat.sending.value || editor.generating) return
  draft.value = ''
  const index = props.activeSlide ? props.presentation.slides?.findIndex((s) => s.id === props.activeSlide!.id) : -1
  void chat.send(text, { slideIndex: index !== undefined && index >= 0 ? index : null })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

async function removeConversation(id: string) {
  try {
    await chat.deleteConversation(id)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not delete the conversation')
  }
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col gap-2" aria-label="Chat">
    <div class="flex justify-end">
      <ConversationMenu
        :conversations="chat.conversations.value"
        :current-id="chat.conversationId.value"
        @select="chat.openConversation"
        @new="chat.newConversation"
        @delete="removeConversation"
      />
    </div>

    <div ref="list" class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1" aria-live="polite">
      <p v-if="!chat.messages.value.length && !chat.loading.value" class="m-auto text-center text-[12px] text-muted">
        Ask Presenton to change the deck, rewrite a slide or answer questions about it.
      </p>
      <ChatMessage v-for="m in chat.messages.value" :key="m.id" :message="m" />
      <ul v-if="chat.activity.value.length" class="flex flex-col gap-1 px-1">
        <ChatActivityRow v-for="a in chat.activity.value" :key="a.id" :item="a" />
      </ul>
      <p v-if="chat.sending.value" data-testid="chat-status" class="px-1 text-[11px] text-muted">{{ busyLabel }}…</p>
    </div>

    <form class="flex items-end gap-2" @submit.prevent="submit">
      <Textarea
        v-model="draft"
        class="min-h-10 flex-1"
        rows="2"
        placeholder="Message the deck assistant"
        aria-label="Message"
        :disabled="chat.sending.value"
        @keydown="onKeydown"
      />
      <Button v-if="chat.sending.value" type="button" variant="secondary" size="icon" aria-label="Stop" @click="chat.stop()">
        <Square class="size-3.5" />
      </Button>
      <Button v-else type="submit" size="icon" aria-label="Send" :disabled="!draft.trim() || editor.generating"><Send class="size-3.5" /></Button>
    </form>
  </section>
</template>
