<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { AudioLines, Film, Trash2, Upload, Video } from 'lucide-vue-next'
import type { Slide } from '@/api/types'
import { useEditorStore } from '@/stores/editor'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { injectDeckNarration } from '../narration/useDeckNarration'
import AvatarChip from './AvatarChip.vue'
import { failureText, hasVideoPlaceholder, otherAvatarLanguage } from './avatar-state'
import { injectDeckAvatars } from './useDeckAvatars'

/**
 * The active slide's presenter: the switch that puts it on the slide (its placeholder layer), then its video and
 * the two ways to get one. Whenever "Generate avatar" is disabled, the reason is on screen.
 */
const props = defineProps<{ slide: Slide }>()

const editor = useEditorStore()
// Below 1050px the inspector is a modal drawer (see EditorLayout); it would cover the footer the Voice fix opens.
const inDrawer = useMediaQuery('(max-width: 1050px)')
const { stateOf, language, languageName, languages } = injectDeckNarration()
const {
  videoBySlide,
  planBySlide,
  chipOf,
  blockerFor,
  deckBlocker,
  busy: busySet,
  togglePlaceholder,
  uploadVideo,
  removeVideo,
  requestGenerate,
} = injectDeckAvatars()

const input = ref<HTMLInputElement | null>(null)
const n = computed(() => props.slide.index + 1)
const hasPlaceholder = computed(() => hasVideoPlaceholder(props.slide))
const narration = computed(() => stateOf(props.slide))
const video = computed(() => videoBySlide.value.get(props.slide.id))
const plan = computed(() => planBySlide.value.get(props.slide.id))
const chip = computed(() => chipOf(props.slide))
const busy = computed(() => busySet.value.has(props.slide.index))
const blocker = computed(() => blockerFor(props.slide))
/** Set when the video was recorded for another narration language: Present and the export then hide it. */
const videoLanguageName = computed(() => {
  const code = otherAvatarLanguage(video.value, language.value)
  return code ? (languages.value?.find((l) => l.code === code)?.name ?? code) : null
})
/** Narration the presenter would lip-sync to is missing or out of date: one click to the Voice tab fixes it. */
const narrationFix = computed(() => {
  if (!hasPlaceholder.value) return null
  if (narration.value === 'stale') return { text: 'Narration changed since it was recorded. Regenerate it first.', tone: 'warn' }
  if (narration.value === 'missing') return { text: "This slide has no narration yet. The presenter lip-syncs to it.", tone: 'todo' }
  return null
})
/** Why "Generate avatar" is disabled when nothing above already says so. */
const reason = computed(() => {
  if (!hasPlaceholder.value) return blocker.value ? 'Turn the presenter on to generate a video for this slide.' : null
  return deckBlocker.value
})

function openVoice() {
  editor.openFooter('voice')
  if (inDrawer.value) editor.inspectorOpen = false
}
function picked(e: Event) {
  const el = e.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (file) uploadVideo(props.slide, file)
}
const note = 'text-[10px] leading-[1.6]'
</script>

<template>
  <section class="flex flex-col gap-3 border-t border-line py-[18px]" aria-label="Slide avatar video" :data-chip="chip" data-testid="slide-avatar">
    <div class="flex items-center gap-2">
      <h3 class="text-[12px] font-semibold whitespace-nowrap text-tx-f6f8f9">Slide {{ n }}</h3>
      <AvatarChip :kind="chip" class="ml-auto" />
    </div>

    <label class="flex cursor-pointer items-start justify-between gap-3 rounded-control bg-field px-3 py-2.5" :class="busy && 'cursor-default'">
      <span class="flex min-w-0 flex-col gap-0.5">
        <span class="text-[11px] font-semibold text-tx-e5edf1">Presenter on this slide</span>
        <span :class="[note, 'text-tx-a0abb1']">{{ hasPlaceholder ? 'Replaces the voice bubble here.' : 'Off: the voice bubble plays here.' }}</span>
      </span>
      <Switch
        :model-value="hasPlaceholder"
        :disabled="busy"
        :aria-label="`Avatar placeholder on slide ${n}`"
        class="mt-0.5 flex-none"
        @update:model-value="togglePlaceholder(slide, Boolean($event))"
      />
    </label>

    <div v-if="narrationFix" class="flex items-start gap-2" :class="[note, narrationFix.tone === 'warn' ? 'text-danger-text' : 'text-tx-a0abb1']">
      <p class="flex-1">{{ narrationFix.text }}</p>
      <button
        type="button"
        class="inline-flex flex-none cursor-pointer items-center gap-1 rounded-control px-1 font-semibold text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
        data-testid="slide-avatar-open-voice"
        @click="openVoice"
      >
        <AudioLines class="size-3" aria-hidden="true" />Open Voice
      </button>
    </div>
    <p v-if="plan?.state === 'failed'" role="alert" :class="[note, 'text-danger-text']">{{ failureText(plan) }}</p>
    <p v-if="videoLanguageName" :class="[note, 'text-danger-text']" data-testid="slide-avatar-language">
      This avatar was recorded for {{ videoLanguageName }} narration, so Present and the video export hide it while the
      deck plays in {{ languageName }}. Switch the narration language, or generate or upload one for {{ languageName }}.
    </p>

    <div v-if="video" class="flex flex-col gap-1">
      <div class="flex items-center gap-2 rounded-control border border-line py-1 pr-1 pl-2.5 text-[11px] text-tx-d4dadd">
        <Film class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span class="min-w-0 truncate">{{ video.original_filename || (video.source === 'heygen' ? 'Generated avatar' : 'Uploaded video') }}</span>
        <Button
          size="sm"
          variant="ghost"
          class="ml-auto text-muted hover:text-danger-text"
          :disabled="busy"
          :aria-label="`Remove video from slide ${n}`"
          @click="removeVideo(slide)"
        >
          <Trash2 class="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      <p v-if="!hasPlaceholder" :class="[note, 'text-tx-a0abb1']" data-testid="slide-video-hidden">
        Kept for later: this video won't play until the presenter is on.
      </p>
    </div>
    <p v-else-if="hasPlaceholder" :class="[note, 'text-tx-a0abb1']" data-testid="slide-no-video">
      No video yet. Generate one from the portrait and this slide's narration, or upload your own.
    </p>

    <div class="flex flex-col gap-2">
      <Button
        size="sm"
        variant="secondary"
        :disabled="blocker !== null || busy"
        :aria-describedby="reason ? 'slide-avatar-reason' : undefined"
        @click="requestGenerate([slide.index])"
      >
        <Video class="size-3.5" aria-hidden="true" />Generate avatar
      </Button>
      <Button size="sm" variant="outline" :disabled="busy" @click="input?.click()">
        <Upload class="size-3.5" aria-hidden="true" />{{ video ? 'Replace video' : 'Upload video' }}
      </Button>
    </div>
    <!-- Narration blockers are explained (with their fix) above; this names every other reason. -->
    <p v-if="reason" id="slide-avatar-reason" :class="[note, 'text-tx-a0abb1']" data-testid="slide-avatar-reason">{{ reason }}</p>
    <input
      ref="input"
      type="file"
      accept="video/mp4,video/webm"
      class="hidden"
      :aria-label="`Video file for slide ${n}`"
      @change="picked"
    />
  </section>
</template>
