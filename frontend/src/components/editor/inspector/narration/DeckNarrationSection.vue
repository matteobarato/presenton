<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { ChevronDown } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { useEditorStore } from '@/stores/editor'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import TtsLanguageSelect from './TtsLanguageSelect.vue'
import { injectDeckNarration } from './useDeckNarration'

const { t } = useI18n()

/** Narration settings that apply to every slide: language, notes and audio generation. Avatars live in the Avatar tab. */
const props = defineProps<{ presentation: Presentation }>()

const editor = useEditorStore()
const {
  languages,
  language,
  languageName,
  setLanguage,
  tts,
  counts,
  generateNotes,
  running,
  progress,
  task,
  taskError,
  canStart,
  generateAll,
  removeTts,
} = injectDeckNarration()
// Per-viewer convenience; useLocalStorage falls back to memory when storage is unavailable.
const open = useLocalStorage('slideshows.editor.deck-narration-open', true)

const total = computed(() => props.presentation.slides.length)
const narrated = computed(() => counts.value.ready + counts.value.translated + counts.value.stale)
const summary = computed(() => [languageName.value, tts.value ? t('editorInspector.narration.deck.narratedCount', { narrated: narrated.value, total: total.value }) : null].filter(Boolean).join(' · '))

const confirmDelete = ref(false)
function deleteNarration() {
  removeTts.mutate(undefined, { onSuccess: () => (confirmDelete.value = false) })
}
</script>

<template>
  <section class="flex flex-col rounded-card border border-ov/[0.06] bg-ov/[0.015]" :aria-label="t('editorInspector.narration.deck.ariaLabel')">
    <button
      type="button"
      class="flex min-h-11 items-center gap-2 px-3 text-left transition-colors duration-200 hover:bg-ov/[0.03]"
      :class="open ? 'rounded-t-card' : 'rounded-card'"
      :aria-expanded="open"
      aria-controls="deck-narration-body"
      @click="open = !open"
    >
      <span class="text-[12px] font-semibold text-tx-f6f8f9">{{ t('editorInspector.narration.deck.title') }}</span>
      <span class="min-w-0 flex-1 truncate text-right text-[11px] text-muted">{{ summary }}</span>
      <ChevronDown class="size-3.5 flex-none text-muted transition-transform duration-200" :class="open && 'rotate-180'" aria-hidden="true" />
    </button>

    <div v-if="running" class="flex flex-col gap-1 px-3 pb-3" role="status">
      <Progress :model-value="progress" :aria-label="t('editorInspector.narration.progressAria')" />
      <span class="text-[11px] text-muted">{{ task?.message || t('editorInspector.narration.deck.generating') }}</span>
    </div>

    <div v-show="open" id="deck-narration-body" class="flex flex-1 flex-col gap-3 border-t border-ov/[0.06] p-3">
      <TtsLanguageSelect :model-value="language" :languages="languages ?? []" :disabled="running" @update:model-value="setLanguage" />
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p v-if="tts" class="min-w-0 text-[11px] text-muted tabular-nums" data-testid="narration-counts">
          {{ t('editorInspector.narration.deck.counts', { upToDate: counts.ready + counts.translated, outOfDate: counts.stale, withoutAudio: counts.missing }) }}
        </p>
        <Button
          size="sm"
          variant="ghost"
          class="-mr-2 ml-auto h-7 px-2 font-medium hover:text-danger-text"
          :disabled="running || !tts?.audios.length"
          @click="confirmDelete = true"
        >
          {{ t('editorInspector.narration.deck.delete') }}
        </Button>
      </div>
      <div class="flex flex-wrap gap-2 [&>*]:min-w-[132px] [&>*]:flex-1">
        <Button size="sm" variant="secondary" :disabled="generateNotes.isPending.value || editor.generating" @click="generateNotes.mutate()">
          {{ t('editorInspector.narration.deck.generateNotes') }}
        </Button>
        <Button size="sm" :disabled="!canStart" @click="generateAll">{{ t('editorInspector.narration.deck.generate') }}</Button>
      </div>
      <p v-if="taskError" role="alert" class="text-[11px] text-danger-text">{{ taskError }}</p>
    </div>

    <Dialog v-model:open="confirmDelete">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('editorInspector.narration.deck.deleteTitle') }}</DialogTitle>
          <DialogDescription>{{ t('editorInspector.narration.deck.deleteDescription') }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="confirmDelete = false">{{ t('common.actions.cancel') }}</Button>
          <Button variant="destructive" :disabled="removeTts.isPending.value" @click="deleteNarration">{{ t('common.actions.delete') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
