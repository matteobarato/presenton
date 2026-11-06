<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useMutation } from '@tanstack/vue-query'
import { Sparkles } from 'lucide-vue-next'
import { generateSpeakerNotes } from '@/api/speakerNotes'
import type { Slide } from '@/api/types'
import { useNoteDraft } from '@/composables/useNoteDraft'
import { useEditorStore } from '@/stores/editor'

const props = defineProps<{ presentationId: string; slide: Slide }>()
const editor = useEditorStore()
const { draft, onInput, discard, replace, fail, failureFor } = useNoteDraft(toRef(props, 'presentationId'), toRef(props, 'slide'))

const generate = useMutation({
  mutationFn: (index: number) => generateSpeakerNotes(props.presentationId, { slide_indexes: [index], regenerate: true }),
})

async function onGenerate() {
  const index = props.slide.index
  discard()
  try {
    const deck = await generate.mutateAsync(index)
    replace(deck.slides.find((s) => s.index === index)?.speaker_note ?? '', index)
  } catch (e) {
    fail(e instanceof Error && e.message ? e.message : 'Could not generate notes.')
  }
}

const generating = computed(() => generate.isPending.value)
</script>

<template>
  <section aria-label="Speaker notes" class="shrink-0 rounded-panel bg-storyboard p-3">
    <div class="mb-2 flex items-center justify-between">
      <h2 class="text-[11px] font-semibold tracking-wide text-muted uppercase">Speaker notes</h2>
      <button
        type="button"
        :disabled="generating || editor.generating"
        class="inline-flex h-7 items-center gap-1.5 rounded-button px-2.5 text-[11px] font-semibold text-muted transition-colors duration-200 hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-35"
        @click="onGenerate"
      >
        <Sparkles class="size-3.5" aria-hidden="true" />{{ generating ? 'Generating…' : 'Generate' }}
      </button>
    </div>
    <textarea
      v-model="draft"
      rows="3"
      aria-label="Speaker notes"
      placeholder="What will you say on this slide?"
      :disabled="generating"
      :readonly="editor.generating"
      class="w-full resize-y rounded-button bg-field px-3 py-2 text-[12px] leading-[1.6] text-[#dce6ec] placeholder:text-muted focus-visible:outline-none disabled:opacity-60"
      @input="onInput"
    />
    <p v-if="failureFor(slide)" role="alert" class="mt-1 text-[12px] text-danger-text">{{ failureFor(slide) }}</p>
  </section>
</template>
