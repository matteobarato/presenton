<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, toRef } from 'vue'
import { useMutation } from '@tanstack/vue-query'
import { Sparkles } from 'lucide-vue-next'
import { generateSpeakerNotes } from '@/api/speakerNotes'
import type { Slide } from '@/api/types'
import { useNoteDraft } from '@/composables/useNoteDraft'
import { useEditorStore } from '@/stores/editor'

const props = defineProps<{ presentationId: string; slide: Slide }>()
const editor = useEditorStore()
const { t } = useI18n()
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
    fail(e instanceof Error && e.message ? e.message : t('editor.notes.couldNotGenerate'))
  }
}

const generating = computed(() => generate.isPending.value)
</script>

<template>
  <section :aria-label="t('editor.notes.speakerNotes')" class="flex flex-col gap-2">
    <textarea
      v-model="draft"
      rows="3"
      :aria-label="t('editor.notes.speakerNotes')"
      :placeholder="t('editor.notes.placeholder')"
      :disabled="generating"
      :readonly="editor.generating"
      class="max-h-[150px] min-h-[82px] w-full resize-y [field-sizing:content] rounded-control border border-ov/[0.06] bg-ov/[0.02] px-3 py-2 text-[12px] leading-[1.65] text-tx-c3cdd2 transition-colors hover:border-ov/[0.1] focus:border-accent focus:bg-ov/[0.03] focus:text-tx-e3eaee focus-visible:outline-none read-only:hover:border-ov/[0.06] disabled:opacity-60"
      @input="onInput"
    />
    <div class="flex items-center justify-between gap-2">
      <p v-if="failureFor(slide)" role="alert" class="text-[11px] text-danger-text">{{ failureFor(slide) }}</p>
      <button
        type="button"
        :disabled="generating || editor.generating"
        class="ml-auto inline-flex h-7 items-center gap-1.5 rounded-control border border-ov/[0.08] px-2.5 text-[11px] font-medium text-tx-c9e5f2 hover:border-ov/[0.14] hover:bg-sx-475e6c80 hover:text-tx-e3f5fe disabled:pointer-events-none disabled:opacity-35"
        @click="onGenerate"
      >
        <Sparkles class="size-3.5" aria-hidden="true" />{{ generating ? t('editor.notes.writing') : t('editor.notes.writeWithAi') }}
      </button>
    </div>
  </section>
</template>
