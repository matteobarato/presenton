<script setup lang="ts">
import { computed, ref } from 'vue'
import { Film, Trash2, Upload, Video } from 'lucide-vue-next'
import type { Slide } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { injectDeckNarration } from '../narration/useDeckNarration'
import AvatarChip from './AvatarChip.vue'
import { failureText, hasVideoPlaceholder } from './avatar-state'
import { injectDeckAvatars } from './useDeckAvatars'

/** The active slide's avatar: its placeholder layer, its video and its generation. */
const props = defineProps<{ slide: Slide }>()

const { stateOf } = injectDeckNarration()
const {
  videoBySlide,
  planBySlide,
  chipOf,
  blockerFor,
  deckBlocker,
  busy: busySet,
  progress,
  task,
  togglePlaceholder,
  uploadVideo,
  removeVideo,
  requestGenerate,
} = injectDeckAvatars()

const input = ref<HTMLInputElement | null>(null)
const n = computed(() => props.slide.index + 1)
const hasPlaceholder = computed(() => hasVideoPlaceholder(props.slide))
const narration = computed(() => stateOf(props.slide))
const video = computed(() => videoBySlide.value.get(props.slide.index))
const plan = computed(() => planBySlide.value.get(props.slide.index))
const chip = computed(() => chipOf(props.slide))
const busy = computed(() => busySet.value.has(props.slide.index))
const blocker = computed(() => blockerFor(props.slide))

function picked(e: Event) {
  const el = e.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (file) uploadVideo(props.slide, file)
}
</script>

<template>
  <section class="flex flex-col gap-2" aria-label="Avatar video" :data-chip="chip" data-testid="slide-avatar">
    <div class="flex items-center gap-2">
      <h3 class="text-[12px] font-semibold text-[#f6f8f9]">Avatar video</h3>
      <AvatarChip :kind="chip" class="ml-auto" />
    </div>

    <label class="flex items-start gap-2.5 rounded-card border border-white/[0.06] p-2.5 text-[11px] text-muted">
      <Switch
        :model-value="hasPlaceholder"
        :disabled="busy"
        :aria-label="`Avatar placeholder on slide ${n}`"
        class="mt-px"
        @update:model-value="togglePlaceholder(slide, Boolean($event))"
      />
      <span class="flex flex-col gap-0.5">
        <span class="text-[12px] font-semibold text-[#d4dadd]">Show an avatar on this slide</span>
        A presenter, lip-synced to this slide's audio, takes the place of the voice bubble.
      </span>
    </label>

    <p v-if="hasPlaceholder && narration === 'stale'" class="text-[11px] text-danger-text">Narration changed — regenerate the audio first.</p>
    <p v-else-if="hasPlaceholder && narration === 'missing'" class="text-[11px] text-muted">Generate this slide's audio first.</p>
    <p v-if="plan?.state === 'failed'" role="alert" class="text-[11px] text-danger-text">{{ failureText(plan) }}</p>

    <div v-if="video" class="flex items-center gap-2 rounded-card bg-black/15 py-1 pr-1 pl-2.5 text-[11px] text-muted">
      <Film class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="min-w-0 truncate">{{ video.original_filename || (video.source === 'heygen' ? 'Generated avatar' : 'Uploaded video') }}</span>
      <Button
        size="sm"
        variant="ghost"
        class="ml-auto"
        :disabled="busy"
        :aria-label="`Remove video from slide ${n}`"
        @click="removeVideo(slide)"
      >
        <Trash2 class="size-3.5" aria-hidden="true" />
      </Button>
    </div>

    <div v-if="plan?.state === 'queued' || plan?.state === 'generating'" class="flex flex-col gap-1" role="status">
      <Progress :model-value="progress" aria-label="Avatar generation progress" />
      <span class="text-[11px] text-muted">{{ task?.message || 'Generating avatar…' }}</span>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <Button size="sm" variant="outline" :disabled="busy" @click="input?.click()">
        <Upload class="size-3.5" aria-hidden="true" />{{ video ? 'Replace video' : 'Upload video' }}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        :disabled="blocker !== null || busy"
        :aria-describedby="deckBlocker && hasPlaceholder ? 'slide-avatar-reason' : undefined"
        @click="requestGenerate([slide.index])"
      >
        <Video class="size-3.5" aria-hidden="true" />Generate avatar
      </Button>
    </div>
    <!-- A slide's own blockers (placeholder, narration) are explained above; this is for deck-wide ones. -->
    <p v-if="deckBlocker && hasPlaceholder" id="slide-avatar-reason" class="text-[11px] text-muted" data-testid="slide-avatar-reason">
      {{ deckBlocker }}
    </p>
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
