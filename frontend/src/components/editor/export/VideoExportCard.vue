<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, reactive, ref, toRef, watch } from 'vue'
import { Captions, CaptionsOff, Download, Film, Loader2, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { extractApiErrorMessage } from '@/api/errors'
import { deleteVideoExport, getVideoExport, startVideoExport, toDownloadUrl, type VideoExport, type VideoRequest } from '@/api/exports'
import { listTtsLanguages, type TtsLanguage } from '@/api/tts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import type { Presentation } from '@/api/types'
import { useAsyncTask } from '@/composables/useAsyncTask'
import { useTtsLanguage } from '@/composables/useTtsLanguage'
import { useAnimations } from '@/composables/useSlideAnimation'
import { useEditorStore } from '@/stores/editor'
import VideoExportOptions from './VideoExportOptions.vue'

const props = defineProps<{ presentationId: string; presentation: Presentation }>()

const { language: ttsLanguage } = useTtsLanguage(
  toRef(() => props.presentationId),
  toRef(() => props.presentation),
)

// Motion summary. Animatable: a template slide with elements to animate (smart slides are "unsupported").
// Animated: one of those with a stored plan that moves something.
const editor = useEditorStore()
const { t } = useI18n()
const animations = useAnimations(toRef(() => props.presentationId))
const motion = computed(() => {
  const list = animations.data.value?.slides
  if (!list) return null
  const animatable = list.filter((a) => a.status !== 'unsupported' && a.targets.length > 0)
  const animated = animatable.filter((a) => a.status !== 'missing' && a.tweens.length > 0)
  return animatable.length ? { animated: animated.length, total: animatable.length } : null
})
function editMotion() {
  editor.exportOpen = false
  editor.openMotion()
}

const form = reactive<VideoRequest>({
  language: ttsLanguage.value || 'en',
  regenerate: false,
  voice: '',
  resolution: '1080p',
  fps: 30,
  subtitles: 'soft',
  min_slide_seconds: 3,
  padding_seconds: 0.4,
  generate_missing_audio: true,
  animate: true,
  speaker_indicator: true,
  crossfade_seconds: 0.5,
  avatars: true,
})
const languages = ref<TtsLanguage[]>([])
const video = ref<VideoExport | null>(null)
const startError = ref<string | null>(null)
const starting = ref(false)
const confirmDelete = ref(false)
const taskId = ref<string | null>(null)

// Soft subtitles come with a sidecar .vtt: the preview plays it as a track the captions button shows or hides (off until asked).
// (Burned subtitles are part of the picture and can't be turned off.)
const videoEl = ref<HTMLVideoElement | null>(null)
const captionsOn = ref(false)
const subtitleSrc = computed(() => (video.value?.subtitle_url ? toDownloadUrl(video.value.subtitle_url) : null))
function applyCaptions() {
  const track = videoEl.value?.textTracks?.[0]
  if (track) track.mode = captionsOn.value ? 'showing' : 'hidden'
}
watch(captionsOn, applyCaptions)

async function refetch() {
  try {
    video.value = await getVideoExport(props.presentationId, form.language)
  } catch {
    video.value = null
  }
}

const { task, status, error, start, clear } = useAsyncTask(taskId, {
  storageKey: `slideshows.task.mp4.${props.presentationId}`,
  onDone: () => {
    void refetch().then(clear)
  },
})

function progressPercent(): number {
  const d = task.value?.data as { completed?: number; total?: number } | null | undefined
  return d?.total ? Math.min(100, Math.round(((d.completed ?? 0) / d.total) * 100)) : 0
}

async function run() {
  starting.value = true
  startError.value = null
  const body: VideoRequest = { ...form, voice: form.voice || null }
  try {
    const t = await startVideoExport(props.presentationId, body)
    if (t.id) start(t.id)
  } catch (e) {
    startError.value = extractApiErrorMessage(e, t('editor.export.video.couldNotStart'))
  } finally {
    starting.value = false
  }
}

async function remove() {
  confirmDelete.value = false
  try {
    await deleteVideoExport(props.presentationId, video.value?.language ?? form.language)
    video.value = null
  } catch (e) {
    toast.error(extractApiErrorMessage(e, t('editor.export.video.couldNotDelete')))
  }
}

// Follow the narration language (it may settle after the list loads, or change in the Voice tab).
watch(ttsLanguage, (code) => {
  if (code) form.language = code
})
watch(() => form.language, () => void refetch())

onMounted(async () => {
  void refetch()
  try {
    languages.value = await listTtsLanguages()
  } catch {
    /* the language stays at the stored default */
  }
})
</script>

<template>
  <div class="flex flex-col gap-3" data-testid="export-mp4">
    <VideoExportOptions :model-value="form" :languages="languages" :disabled="status === 'pending' || starting" />

    <p v-if="motion" class="flex flex-wrap items-center gap-x-2 text-[11px] text-muted" data-testid="mp4-animations">
      <span>{{ t('editor.export.video.animations', { animated: motion.animated, total: motion.total }) }}</span>
      <button
        type="button"
        class="text-accent underline-offset-2 hover:underline"
        data-testid="mp4-animations-edit"
        @click="editMotion"
      >
        {{ t('editor.export.video.editInMotion') }}
      </button>
    </p>

    <Button :disabled="status === 'pending' || starting" data-testid="mp4-start" @click="run">
      <Loader2 v-if="status === 'pending' || starting" :size="14" class="animate-spin motion-reduce:animate-none" />
      <Film v-else :size="14" />
      {{ video ? t('editor.export.video.renderAgain') : t('editor.export.video.renderMp4') }}
    </Button>

    <p v-if="startError" role="alert" class="text-[11px] text-danger-text" data-testid="mp4-start-error">{{ startError }}</p>

    <div v-if="status === 'pending'" class="flex flex-col gap-1.5" data-testid="mp4-progress">
      <Progress :model-value="progressPercent()" />
      <p class="text-[11px] text-muted" data-testid="mp4-message">{{ task?.message || t('editor.export.video.queued') }}</p>
    </div>
    <div v-if="status === 'error'" role="alert" class="text-[11px] text-danger-text" data-testid="mp4-task-error">
      {{ error }}
      <button type="button" class="ml-1 underline" @click="clear">{{ t('editor.export.video.dismiss') }}</button>
    </div>

    <div v-if="video" class="flex flex-col gap-2" data-testid="mp4-result">
      <video
        ref="videoEl"
        :src="toDownloadUrl(video.url)"
        controls
        preload="metadata"
        class="w-full rounded-button bg-black"
        data-testid="mp4-video"
        @loadedmetadata="applyCaptions"
      >
        <track v-if="subtitleSrc" kind="subtitles" :src="subtitleSrc" :srclang="video.language" :label="video.language_name || video.language" />
      </video>
      <div class="flex items-center gap-2">
        <a
          :href="toDownloadUrl(video.url)"
          download
          class="inline-flex items-center gap-1.5 text-[12px] text-accent underline-offset-2 hover:underline"
          data-testid="mp4-download"
        >
          <Download :size="13" /> {{ t('editor.export.video.downloadMp4') }}
        </a>
        <Button
          v-if="subtitleSrc"
          variant="ghost"
          size="sm"
          class="ml-auto"
          :aria-pressed="captionsOn"
          data-testid="mp4-captions"
          @click="captionsOn = !captionsOn"
        >
          <Captions v-if="captionsOn" :size="13" />
          <CaptionsOff v-else :size="13" />
          {{ captionsOn ? t('editor.export.video.hideCaptions') : t('editor.export.video.showCaptions') }}
        </Button>
        <Button variant="ghost" size="sm" :class="subtitleSrc ? '' : 'ml-auto'" data-testid="mp4-delete" @click="confirmDelete = true">
          <Trash2 :size="13" /> {{ t('common.actions.delete') }}
        </Button>
      </div>
    </div>

    <Dialog v-model:open="confirmDelete">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('editor.export.video.deleteTitle') }}</DialogTitle>
          <DialogDescription>{{ t('editor.export.video.deleteDescription') }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" @click="confirmDelete = false">{{ t('common.actions.cancel') }}</Button>
          <Button variant="destructive" data-testid="mp4-delete-confirm" @click="remove">{{ t('common.actions.delete') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
