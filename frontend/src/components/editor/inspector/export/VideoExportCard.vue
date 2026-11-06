<script setup lang="ts">
import { onMounted, reactive, ref, toRef, watch } from 'vue'
import { Download, Film, Loader2, Trash2 } from 'lucide-vue-next'
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
import VideoExportOptions from './VideoExportOptions.vue'

const props = defineProps<{ presentationId: string; presentation: Presentation }>()

const { language: ttsLanguage } = useTtsLanguage(
  toRef(() => props.presentationId),
  toRef(() => props.presentation),
)

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
  animate: false,
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

async function refetch() {
  try {
    video.value = await getVideoExport(props.presentationId, form.language)
  } catch {
    video.value = null
  }
}

const { task, status, error, start, clear } = useAsyncTask(taskId, {
  storageKey: `presenton.task.mp4.${props.presentationId}`,
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
    startError.value = extractApiErrorMessage(e, 'Could not start the video export')
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
    toast.error(extractApiErrorMessage(e, 'Could not delete the video'))
  }
}

// Follow the narration language (it may settle after the list loads, or change in the Narration tab).
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

    <Button :disabled="status === 'pending' || starting" data-testid="mp4-start" @click="run">
      <Loader2 v-if="status === 'pending' || starting" :size="14" class="animate-spin motion-reduce:animate-none" />
      <Film v-else :size="14" />
      {{ video ? 'Render again' : 'Render MP4' }}
    </Button>

    <p v-if="startError" role="alert" class="text-[11px] text-danger-text" data-testid="mp4-start-error">{{ startError }}</p>

    <div v-if="status === 'pending'" class="flex flex-col gap-1.5" data-testid="mp4-progress">
      <Progress :model-value="progressPercent()" />
      <p class="text-[11px] text-muted" data-testid="mp4-message">{{ task?.message || 'Queued...' }}</p>
    </div>
    <div v-if="status === 'error'" role="alert" class="text-[11px] text-danger-text" data-testid="mp4-task-error">
      {{ error }}
      <button type="button" class="ml-1 underline" @click="clear">Dismiss</button>
    </div>

    <div v-if="video" class="flex flex-col gap-2" data-testid="mp4-result">
      <video :src="toDownloadUrl(video.url)" controls preload="metadata" class="w-full rounded-button bg-black" data-testid="mp4-video" />
      <div class="flex items-center gap-2">
        <a
          :href="toDownloadUrl(video.url)"
          download
          class="inline-flex items-center gap-1.5 text-[12px] text-accent underline-offset-2 hover:underline"
          data-testid="mp4-download"
        >
          <Download :size="13" /> Download MP4
        </a>
        <Button variant="ghost" size="sm" class="ml-auto" data-testid="mp4-delete" @click="confirmDelete = true">
          <Trash2 :size="13" /> Delete
        </Button>
      </div>
    </div>

    <Dialog v-model:open="confirmDelete">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this video?</DialogTitle>
          <DialogDescription>The rendered MP4 file will be removed. You can render it again later.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" @click="confirmDelete = false">Cancel</Button>
          <Button variant="destructive" data-testid="mp4-delete-confirm" @click="remove">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
