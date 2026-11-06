<script setup lang="ts">
import { computed, ref } from 'vue'
import { Film, Trash2 } from 'lucide-vue-next'
import type { Slide } from '@/api/types'
import type { AvatarSlidePlan, SlideVideo } from '@/api/videos'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { NarrationState } from '../narration/narration-state'
import AvatarChip from './AvatarChip.vue'
import { chipFor, failureText } from './avatar-state'

const props = defineProps<{
  slide: Slide
  hasPlaceholder: boolean
  narration: NarrationState
  video?: SlideVideo
  plan?: AvatarSlidePlan
  previewReason?: string | null
  selected: boolean
  busy: boolean
}>()
const emit = defineEmits<{
  'update:selected': [value: boolean]
  'update:placeholder': [value: boolean]
  upload: [file: File]
  'remove-video': []
}>()

const input = ref<HTMLInputElement | null>(null)
const n = computed(() => props.slide.index + 1)
const chip = computed(() =>
  chipFor({ plan: props.plan, hasPlaceholder: props.hasPlaceholder, narration: props.narration, video: props.video, previewReason: props.previewReason }),
)

function picked(e: Event) {
  const el = e.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (file) emit('upload', file)
}
</script>

<template>
  <li class="flex flex-col gap-1.5 rounded-control border border-white/[0.06] p-2" :data-chip="chip">
    <div class="flex items-center gap-2">
      <input
        type="checkbox"
        :checked="selected"
        :aria-label="`Select slide ${n} for avatar generation`"
        @change="emit('update:selected', ($event.target as HTMLInputElement).checked)"
      />
      <span class="text-[12px] text-[#d4dadd]">Slide {{ n }}</span>
      <AvatarChip :kind="chip" class="ml-auto" />
    </div>

    <label class="flex items-center gap-2 text-[11px] text-muted">
      <Switch
        :model-value="hasPlaceholder"
        :disabled="busy"
        :aria-label="`Avatar placeholder on slide ${n}`"
        @update:model-value="emit('update:placeholder', Boolean($event))"
      />
      Avatar placeholder
    </label>

    <p v-if="hasPlaceholder && narration === 'stale'" class="text-[11px] text-danger-text">Narration changed — regenerate</p>
    <p v-else-if="hasPlaceholder && narration === 'missing'" class="text-[11px] text-muted">Generate this slide's narration first.</p>
    <p v-if="plan?.state === 'failed'" role="alert" class="text-[11px] text-danger-text">{{ failureText(plan) }}</p>

    <div v-if="video" class="flex items-center gap-2 text-[11px] text-muted">
      <Film class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="min-w-0 truncate">{{ video.original_filename || (video.source === 'heygen' ? 'Generated avatar' : 'Uploaded video') }}</span>
      <Button
        size="sm"
        variant="ghost"
        class="ml-auto"
        :disabled="busy"
        :aria-label="`Remove video from slide ${n}`"
        @click="emit('remove-video')"
      >
        <Trash2 class="size-3.5" aria-hidden="true" />
      </Button>
    </div>
    <div class="flex">
      <Button size="sm" variant="outline" :disabled="busy" @click="input?.click()">
        {{ video ? 'Replace video' : 'Upload video' }}
      </Button>
      <input
        ref="input"
        type="file"
        accept="video/mp4,video/webm"
        class="hidden"
        :aria-label="`Video file for slide ${n}`"
        @change="picked"
      />
    </div>
  </li>
</template>
