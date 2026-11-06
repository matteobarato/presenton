<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from 'vue'
import { ArrowUp, Sparkles } from 'lucide-vue-next'
import type { Slide } from '@/api/types'
import { useChat } from '@/composables/useChat'
import { renderMarkdown } from '@/lib/mini-markdown'
import { slideKind } from '@/render/slide-kind'
import { useEditorStore } from '@/stores/editor'

const props = defineProps<{ open: boolean; slide: Slide }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; edited: [] }>()

const SUGGESTIONS = ['Make it more concise', 'Use a friendlier tone', 'Add a supporting data point']

const editor = useEditorStore()
// A dedicated chat instance: the prompt goes through chat, whose tools rebuild the slide ui.
const chat = useChat(toRef(() => props.slide.presentation as string))
const prompt = ref('')
const input = ref<HTMLTextAreaElement | null>(null)
const error = ref('')
const reply = ref('')

const supported = computed(() => {
  const kind = slideKind(props.slide)
  return kind === 'template' || kind === 'blank'
})
const pending = computed(() => chat.sending.value)
const canSubmit = computed(() => supported.value && !pending.value && !editor.generating && prompt.value.trim() !== '')
const replyHtml = computed(() => (reply.value ? renderMarkdown(reply.value) : ''))

watch(
  () => props.open,
  (open) => {
    if (open) void nextTick(() => input.value?.focus())
  },
  { immediate: true, flush: 'post' },
)
// Navigating to another slide starts clean. A re-id at the same position (the AI's own edit) must not
// wipe the reply that explains it.
watch(
  () => props.slide.index,
  () => {
    reply.value = ''
    error.value = ''
    prompt.value = ''
  },
)

function close() {
  emit('update:open', false)
  // The toolbar's Ask button is the opener; hand focus back to it.
  void nextTick(() => document.querySelector<HTMLElement>('[data-ask-button]')?.focus())
}

function pick(text: string) {
  prompt.value = text
  input.value?.focus()
}

async function submit() {
  if (!canSubmit.value) return
  error.value = ''
  reply.value = ''
  const before = chat.messages.value.length
  await chat.send(prompt.value, { slideIndex: props.slide.index })
  const turn = chat.messages.value.slice(before)
  const failed = turn.find((m) => m.role === 'error')
  if (failed) {
    error.value = failed.content
    void nextTick(() => input.value?.focus())
    return
  }
  reply.value = turn.filter((m) => m.role === 'assistant').at(-1)?.content ?? ''
  prompt.value = ''
  emit('edited')
}
</script>

<template>
  <Transition name="slide-change">
    <section
      v-if="open"
      role="dialog"
      aria-label="Ask AI to edit this slide"
      class="glass-prompt absolute bottom-4 left-1/2 z-20 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 p-3"
      @keydown.esc.stop="close"
    >
      <form class="flex flex-col gap-2" @submit.prevent="submit">
        <div class="flex items-end gap-2">
          <textarea
            ref="input"
            v-model="prompt"
            rows="2"
            aria-label="Describe the change"
            placeholder="What should change on this slide?"
            :readonly="pending"
            class="min-h-12 flex-1 resize-none bg-transparent text-[13px] leading-[1.5] text-[#dce6ec] placeholder:text-muted read-only:opacity-60 focus-visible:outline-none"
            @keydown.enter.exact.prevent="submit"
          />
          <button
            type="submit"
            aria-label="Send"
            :disabled="!canSubmit"
            class="grid size-8 shrink-0 place-items-center rounded-control bg-accent text-accent-ink transition-colors duration-200 hover:bg-accent-hover disabled:opacity-35"
          >
            <ArrowUp class="size-4" aria-hidden="true" />
          </button>
        </div>
        <div class="flex min-h-6 flex-wrap items-center gap-1.5">
          <template v-if="pending">
            <div class="thinking-dots" role="status" aria-label="Editing the slide" data-testid="thinking">
              <span /><span /><span />
            </div>
            <span v-if="chat.status.value" class="text-[11px] text-muted" data-testid="ask-status">{{ chat.status.value }}</span>
          </template>
          <template v-else>
            <Sparkles class="size-3.5 text-muted" aria-hidden="true" />
            <button
              v-for="s in SUGGESTIONS"
              :key="s"
              type="button"
              class="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-muted transition-colors duration-200 hover:border-white/20 hover:text-white"
              @click="pick(s)"
            >
              {{ s }}
            </button>
          </template>
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -- sanitised by renderMarkdown (DOMPurify) -->
        <div v-if="replyHtml && !pending" class="text-[12px] leading-[1.6] text-[#dce6ec]" data-testid="ask-reply" v-html="replyHtml" />
        <p v-if="!supported" class="text-[12px] text-muted">AI edit is available for template slides</p>
        <p v-if="error" role="alert" class="text-[12px] text-danger-text">{{ error }}</p>
      </form>
    </section>
  </Transition>
</template>
