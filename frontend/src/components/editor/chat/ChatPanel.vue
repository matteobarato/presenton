<script setup lang="ts">
import { computed, nextTick, onMounted, ref, toRef, watch } from 'vue'
import { ArrowUp, ArrowUpRight, Layers, Square, Sparkles, Type, WandSparkles, X } from 'lucide-vue-next'
import { toast } from '@/components/ui/sonner'
import type { Presentation, Slide } from '@/api/types'
import { useChat } from '@/composables/useChat'
import { useEditorStore } from '@/stores/editor'
import ChatMessage from './ChatMessage.vue'
import ChatActivityRow from './ChatActivityRow.vue'
import ConversationMenu from './ConversationMenu.vue'

const props = defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const editor = useEditorStore()
const chat = useChat(toRef(props, 'presentationId'))
const draft = ref('')
const list = ref<HTMLElement | null>(null)
const input = ref<HTMLTextAreaElement | null>(null)
const busyLabel = computed(() => chat.status.value || 'Working on it')

onMounted(() => void chat.loadHistory())

// Opening the panel puts the caret in the composer.
watch(
  () => editor.chatOpen,
  async (open) => {
    if (!open) return
    await nextTick()
    input.value?.focus({ preventScroll: true })
  },
  { immediate: true },
)

watch(
  () => [chat.messages.value.length, chat.messages.value.at(-1)?.content, chat.activity.value.length],
  async () => {
    await nextTick()
    if (list.value) list.value.scrollTop = list.value.scrollHeight
  },
)

const slideIndex = computed(() => {
  const index = props.activeSlide ? props.presentation.slides?.findIndex((s) => s.id === props.activeSlide!.id) : -1
  return index !== undefined && index >= 0 ? index : null
})

// Aera-style starters: one click sends a real request about the current slide.
const suggestions = [
  { icon: WandSparkles, label: 'Say more with less', prompt: 'Make this slide more concise without losing its point.' },
  { icon: Type, label: 'Sharpen the headline', prompt: 'Rewrite the headline of this slide so it is clearer and more memorable.' },
  { icon: Sparkles, label: 'Give it a great ending', prompt: 'Add a strong closing slide at the end of the deck.' },
]
function suggest(prompt: string) {
  draft.value = prompt
  submit()
}

function submit() {
  const text = draft.value.trim()
  if (!text || chat.sending.value || editor.generating) return
  draft.value = ''
  void chat.send(text, { slideIndex: slideIndex.value })
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
  <section class="flex min-h-0 flex-1 flex-col" aria-label="Ask AI">
    <header
      class="flex h-[57px] flex-none items-center gap-2 border-b border-line pr-2.5 pl-4 [@media(max-height:780px)_and_(min-width:1051px)]:h-[49px]"
    >
      <span class="grid size-[26px] place-items-center rounded-[8px] bg-[#3c4c552e] text-[#c9e5f2]" aria-hidden="true">
        <Sparkles class="size-3.5" />
      </span>
      <h2 class="text-[12px] font-semibold text-[#edf1f2]">Ask AI</h2>
      <div class="ml-auto flex items-center gap-0.5">
        <ConversationMenu
          :conversations="chat.conversations.value"
          :current-id="chat.conversationId.value"
          @select="chat.openConversation"
          @new="chat.newConversation"
          @delete="removeConversation"
        />
        <button
          type="button"
          class="grid size-7 place-items-center rounded-control text-muted hover:bg-white/[0.04] hover:text-white"
          aria-label="Close Ask AI"
          title="Close (Ctrl+K)"
          @click="editor.chatOpen = false"
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div ref="list" class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 pt-5 pb-4" aria-live="polite">
      <div v-if="!chat.messages.value.length && !chat.loading.value" class="anim-fade-in pt-2">
        <div
          class="mb-[21px] grid size-[55px] place-items-center rounded-[17px] border border-[#c7e9ff12] bg-[linear-gradient(135deg,#4f6c7d6b,#243c4966)] text-[#c5e6f5] shadow-[0_10px_20px_#0002]"
          aria-hidden="true"
        >
          <Sparkles class="size-[26px]" />
        </div>
        <h2 class="text-[20px] leading-[1.28] font-medium tracking-[-0.04em] text-[#e4ecf1]">Your idea.<br />A little more extraordinary.</h2>
        <p class="mt-3 text-[11px] leading-[1.8] text-[#a3b1b8]">
          Ask Presenton to change the deck, rewrite a slide or answer questions about it.
        </p>
        <div class="mt-[27px] flex flex-col gap-2">
          <button
            v-for="s in suggestions"
            :key="s.label"
            type="button"
            :disabled="chat.sending.value || editor.generating"
            class="flex items-center gap-2.5 rounded-[9px] border border-white/[0.02] bg-[#282f33] px-2.5 py-3 text-left text-[11px] text-[#c0cdd5] hover:bg-[#34434c] hover:text-[#e3f6ff] disabled:opacity-50"
            @click="suggest(s.prompt)"
          >
            <component :is="s.icon" class="size-4 text-[#b8d9eb]" aria-hidden="true" />
            <span>{{ s.label }}</span>
            <ArrowUpRight class="ml-auto size-3.5 text-[#9aacb7]" aria-hidden="true" />
          </button>
        </div>
      </div>
      <ChatMessage v-for="m in chat.messages.value" :key="m.id" :message="m" />
      <ul v-if="chat.activity.value.length" class="flex flex-col gap-1 px-1">
        <ChatActivityRow v-for="a in chat.activity.value" :key="a.id" :item="a" />
      </ul>
      <p v-if="chat.sending.value" data-testid="chat-status" class="flex items-center gap-2 px-1 text-[11px] text-muted">
        <span class="thinking-dots" aria-hidden="true"><span /><span /><span /></span>{{ busyLabel }}…
      </p>
    </div>

    <div class="flex-none px-4 pt-3.5 pb-5">
      <form
        class="rounded-card border border-[#b7d8e722] bg-[#272f34] p-3 transition-[border-color] duration-200 focus-within:border-[#b7d8e766]"
        @submit.prevent="submit"
      >
        <textarea
          ref="input"
          v-model="draft"
          rows="3"
          placeholder="What are you imagining?"
          aria-label="Message"
          :disabled="chat.sending.value"
          class="h-[65px] w-full resize-none bg-transparent text-[11px] leading-[1.6] text-[#dce7ef] placeholder:text-[#8d9ea8] focus-visible:outline-none disabled:opacity-60"
          @keydown="onKeydown"
        />
        <div class="flex items-center justify-between">
          <span class="flex items-center gap-[5px] text-[10px] text-[#a4b7c3]">
            <Layers class="size-3" aria-hidden="true" />{{ slideIndex !== null ? `Slide ${slideIndex + 1}` : 'Whole deck' }}
          </span>
          <button
            v-if="chat.sending.value"
            type="button"
            class="grid size-[29px] place-items-center rounded-[8px] bg-secondary text-secondary-text hover:bg-secondary-hover"
            aria-label="Stop"
            @click="chat.stop()"
          >
            <Square class="size-3.5" aria-hidden="true" />
          </button>
          <button
            v-else
            type="submit"
            class="grid size-[29px] place-items-center rounded-[8px] bg-accent text-[#26424e] hover:bg-[#e3f5ff] disabled:opacity-50 disabled:hover:bg-accent"
            aria-label="Send"
            :disabled="!draft.trim() || editor.generating"
          >
            <ArrowUp class="size-[17px]" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  </section>
</template>
