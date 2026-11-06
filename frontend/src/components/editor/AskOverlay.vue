<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ArrowUp, Sparkles } from 'lucide-vue-next'
import { presentationKeys } from '@/api/presentations'
import { editSlide } from '@/api/slides'
import type { Presentation, Slide } from '@/api/types'
import { slideKind } from '@/render/slide-kind'
import { useEditorStore } from '@/stores/editor'

const props = defineProps<{ open: boolean; slide: Slide }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; edited: [] }>()

const SUGGESTIONS = ['Make it more concise', 'Use a friendlier tone', 'Add a supporting data point']

const editor = useEditorStore()
const queryClient = useQueryClient()
const prompt = ref('')
const input = ref<HTMLTextAreaElement | null>(null)
const error = ref('')

const supported = computed(() => {
  const kind = slideKind(props.slide)
  return kind === 'template' || kind === 'blank'
})

const mutation = useMutation({
  mutationFn: (text: string) => editSlide(props.slide.id!, text),
})
const pending = computed(() => mutation.isPending.value)
const canSubmit = computed(
  () => supported.value && !pending.value && !editor.generating && Boolean(props.slide.id) && prompt.value.trim() !== '',
)

watch(
  () => props.open,
  (open) => {
    if (open) void nextTick(() => input.value?.focus())
  },
  { immediate: true, flush: 'post' },
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
  const oldId = props.slide.id!
  error.value = ''
  try {
    const updated = await mutation.mutateAsync(prompt.value.trim())
    const key = presentationKeys.one(props.slide.presentation as string)
    queryClient.setQueryData<Presentation>(key, (deck) =>
      deck ? { ...deck, slides: deck.slides.map((s) => (s.id === oldId ? updated : s)) } : deck,
    )
    // The backend re-ids the slide; keep it selected.
    if (editor.activeSlideId === oldId && updated.id) editor.select(updated.id)
    prompt.value = ''
    emit('edited')
  } catch (e) {
    error.value = e instanceof Error && e.message ? e.message : 'Could not edit this slide.'
  }
}
</script>

<template>
  <Transition name="slide-change">
    <section
      v-if="open"
      role="dialog"
      aria-label="Ask AI to edit this slide"
      class="glass-prompt fixed bottom-16 left-1/2 z-30 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 p-3"
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
            :disabled="pending"
            class="min-h-12 flex-1 resize-none bg-transparent text-[13px] leading-[1.5] text-[#dce6ec] placeholder:text-muted focus-visible:outline-none disabled:opacity-60"
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
          <div v-if="pending" class="thinking-dots" role="status" aria-label="Editing the slide" data-testid="thinking">
            <span /><span /><span />
          </div>
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
        <p v-if="!supported" class="text-[12px] text-muted">AI edit is available for template slides</p>
        <p v-if="error" role="alert" class="text-[12px] text-danger-text">{{ error }}</p>
      </form>
    </section>
  </Transition>
</template>
