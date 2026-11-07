<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { ChevronDown } from 'lucide-vue-next'
import type { Presentation, Slide } from '@/api/types'
import { useEditorStore } from '@/stores/editor'
import SlideView from '@/render/SlideView.vue'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import BubblePlacer from '../video/BubblePlacer.vue'
import PortraitCard from '../video/PortraitCard.vue'
import { injectDeckAvatars } from '../video/useDeckAvatars'
import TtsLanguageSelect from './TtsLanguageSelect.vue'
import { injectDeckNarration } from './useDeckNarration'

/** Narration and avatar settings that apply to every slide: language, batch generation, portrait, voice bubble. */
const props = defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

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
const {
  videos,
  portraitMut,
  eligibleSlides,
  placeholderSlides,
  deckRunBlocker,
  requestGenerate,
  running: avatarsRunning,
  progress: avatarProgress,
  task: avatarTask,
  taskError: avatarError,
} = injectDeckAvatars()

// Per-viewer convenience; useLocalStorage falls back to memory when storage is unavailable.
const open = useLocalStorage('presenton.editor.deck-narration-open', true)

const total = computed(() => props.presentation.slides.length)
const narrated = computed(() => counts.value.ready + counts.value.translated + counts.value.stale)
const summary = computed(() => [languageName.value, tts.value ? `${narrated.value}/${total.value} narrated` : null].filter(Boolean).join(' · '))

const confirmDelete = ref(false)
function deleteNarration() {
  removeTts.mutate(undefined, { onSuccess: () => (confirmDelete.value = false) })
}
</script>

<template>
  <section class="flex flex-col rounded-card border border-white/[0.06]" aria-label="Whole deck">
    <button
      type="button"
      class="flex min-h-11 items-center gap-2 rounded-card px-3 text-left transition-colors duration-200 hover:bg-white/[0.03]"
      :aria-expanded="open"
      aria-controls="deck-narration-body"
      @click="open = !open"
    >
      <span class="text-[12px] font-semibold text-[#f6f8f9]">Whole deck</span>
      <span class="min-w-0 flex-1 truncate text-right text-[11px] text-muted">{{ summary }}</span>
      <ChevronDown class="size-3.5 flex-none text-muted transition-transform duration-200" :class="open && 'rotate-180'" aria-hidden="true" />
    </button>

    <div v-if="running || avatarsRunning" class="flex flex-col gap-2 px-3 pb-3">
      <div v-if="running" class="flex flex-col gap-1" role="status">
        <Progress :model-value="progress" aria-label="Narration progress" />
        <span class="text-[11px] text-muted">{{ task?.message || 'Generating narration…' }}</span>
      </div>
      <div v-if="avatarsRunning" class="flex flex-col gap-1" role="status">
        <Progress :model-value="avatarProgress" aria-label="Avatar generation progress" />
        <span class="text-[11px] text-muted">{{ avatarTask?.message || 'Generating avatars…' }}</span>
      </div>
    </div>

    <div v-show="open" id="deck-narration-body" class="flex flex-col gap-5 border-t border-white/[0.06] p-3">
      <div class="flex flex-col gap-2">
        <TtsLanguageSelect :model-value="language" :languages="languages ?? []" :disabled="running" @update:model-value="setLanguage" />
        <p v-if="tts" class="text-[11px] text-muted tabular-nums" data-testid="narration-counts">
          {{ counts.ready + counts.translated }} up to date · {{ counts.stale }} out of date · {{ counts.missing }} without audio
        </p>
        <div class="flex flex-wrap gap-2 [&>*]:min-w-[110px] [&>*]:flex-1">
          <Button size="sm" variant="secondary" :disabled="generateNotes.isPending.value || editor.generating" @click="generateNotes.mutate()">
            Generate all notes
          </Button>
          <Button size="sm" :disabled="!canStart" @click="generateAll">Generate narration</Button>
        </div>
        <Button size="sm" variant="ghost" class="self-start" :disabled="running || !tts?.audios.length" @click="confirmDelete = true">
          Delete narration
        </Button>
        <p v-if="taskError" role="alert" class="text-[11px] text-danger-text">{{ taskError }}</p>
      </div>

      <PortraitCard
        :portrait="videos?.portrait"
        :busy="portraitMut.isPending.value"
        @upload="portraitMut.mutate($event)"
        @remove="portraitMut.mutate(null)"
      />

      <div class="flex flex-col gap-2">
        <h3 class="text-[12px] font-semibold text-[#f6f8f9]">Avatars</h3>
        <p class="text-[11px] text-muted">
          {{ eligibleSlides.length }} of {{ placeholderSlides.length }} placeholder
          {{ placeholderSlides.length === 1 ? 'slide is' : 'slides are' }} ready to generate.
        </p>
        <Button
          size="sm"
          :disabled="deckRunBlocker !== null"
          aria-describedby="avatar-reason"
          @click="requestGenerate(eligibleSlides.map((s) => s.index))"
        >
          Generate avatars
        </Button>
        <p v-if="deckRunBlocker" id="avatar-reason" class="text-[11px] text-muted" data-testid="avatar-reason">{{ deckRunBlocker }}</p>
        <p v-if="avatarError" role="alert" class="text-[11px] text-danger-text">{{ avatarError }}</p>
      </div>

      <div v-if="activeSlide" class="flex flex-col gap-2">
        <h3 class="text-[12px] font-semibold text-[#f6f8f9]">Voice bubble</h3>
        <p class="text-[11px] text-muted">Where the narrator sits on slides without an avatar. Drag it here; it applies to every slide.</p>
        <div class="relative overflow-hidden rounded-control border border-white/[0.06]">
          <SlideView :slide="activeSlide" :theme="presentation.theme" :fonts="presentation.fonts" fit="width" class="pointer-events-none" />
          <BubblePlacer :presentation-id="presentationId" :slide="activeSlide" :language="language" />
        </div>
      </div>
    </div>

    <Dialog v-model:open="confirmDelete">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete narration?</DialogTitle>
          <DialogDescription>This removes the recorded audio for this language. Speaker notes are kept.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="confirmDelete = false">Cancel</Button>
          <Button variant="destructive" :disabled="removeTts.isPending.value" @click="deleteNarration">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
