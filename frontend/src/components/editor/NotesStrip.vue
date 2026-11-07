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
  <section aria-label="Speaker notes" class="flex flex-col gap-1.5">
    <textarea
      v-model="draft"
      rows="2"
      aria-label="Speaker notes"
      placeholder="Give your story a little direction. Add speaker notes…"
      :disabled="generating"
      :readonly="editor.generating"
      class="max-h-[150px] min-h-9 w-full resize-y bg-transparent px-0.5 text-[11px] leading-[1.7] text-[#a8b3b9] placeholder:text-[#7f8d95] focus:text-[#d2dbe0] focus-visible:outline-none disabled:opacity-60"
      @input="onInput"
    />
    <div class="flex items-center justify-between gap-2">
      <p v-if="failureFor(slide)" role="alert" class="text-[11px] text-danger-text">{{ failureFor(slide) }}</p>
      <button
        type="button"
        :disabled="generating || editor.generating"
        class="ml-auto inline-flex h-7 items-center gap-1.5 rounded-control px-2 text-[10px] font-medium text-[#c9e5f2] hover:bg-[#475e6c80] hover:text-[#e3f5fe] disabled:pointer-events-none disabled:opacity-35"
        @click="onGenerate"
      >
        <Sparkles class="size-3.5" aria-hidden="true" />{{ generating ? 'Writing notes…' : 'Write notes with AI' }}
      </button>
    </div>
  </section>
</template>
