<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Presentation, Slide } from '@/api/types'
import { presentationKeys } from '@/api/presentations'
import { useTts } from '@/api/tts'
import {
  addPlaceholder,
  deletePortrait,
  deleteSlideVideo,
  getAvatarGeneration,
  getAvatarPreview,
  getVideos,
  removePlaceholder,
  slidePlans,
  startAvatarGeneration,
  uploadPortrait,
  uploadSlideVideo,
  videoKeys,
  type AvatarSlidePlan,
} from '@/api/videos'
import { useAsyncTask } from '@/composables/useAsyncTask'
import SlideView from '@/render/SlideView.vue'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { toast } from '@/components/ui/sonner'
import { audioForSlide, narrationState } from './narration/narration-state'
import BubblePlacer from './video/BubblePlacer.vue'
import GenerateAvatarsDialog from './video/GenerateAvatarsDialog.vue'
import PortraitCard from './video/PortraitCard.vue'
import SlideVideoRow from './video/SlideVideoRow.vue'
import { hasVideoPlaceholder, slideBlocker } from './video/avatar-state'

const props = defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const LANG_KEY = 'presenton.tts.lang'
const qc = useQueryClient()
const idRef = computed(() => props.presentationId)
const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong')

const { data: videos } = useQuery({ queryKey: () => videoKeys.all(idRef.value), queryFn: () => getVideos(idRef.value) })
const { data: generation } = useQuery({
  queryKey: () => videoKeys.generation(idRef.value),
  queryFn: () => getAvatarGeneration(idRef.value),
})

// Avatars are lip-synced to the narration, so they follow the narration language.
const storedLanguage = ref(localStorage.getItem(LANG_KEY) ?? '')
const { data: preview } = useQuery({
  queryKey: () => videoKeys.preview(idRef.value, storedLanguage.value),
  queryFn: () => getAvatarPreview(idRef.value, storedLanguage.value || undefined),
  retry: false,
})
const language = computed(() => storedLanguage.value || preview.value?.language || '')
const { data: tts } = useTts(idRef, language)

const slides = computed(() => [...props.presentation.slides].sort((a, b) => a.index - b.index))
const videoBySlide = computed(() => new Map((videos.value?.videos ?? []).map((v) => [v.slide_index, v])))
const previewReason = computed(
  () => new Map((preview.value?.slides ?? []).map((s) => [s.slide_index as number, (s.reason as string | undefined) ?? null])),
)
const narrationOf = (s: Slide) => narrationState(s, audioForSlide(s, tts.value?.audios))

// Selection for generation; starts as every slide that has a placeholder.
const selected = ref(new Set<number>())
let selectionSeeded = false
watch(
  slides,
  (list) => {
    if (selectionSeeded || !list.length) return
    selectionSeeded = true
    selected.value = new Set(list.filter(hasVideoPlaceholder).map((s) => s.index))
  },
  { immediate: true },
)
function setSelected(index: number, on: boolean) {
  const next = new Set(selected.value)
  if (on) next.add(index)
  else next.delete(index)
  selected.value = next
}

// Generation task: resumes after a reload.
const taskId = ref<string | null>(null)
const refreshVideos = () => qc.invalidateQueries({ queryKey: videoKeys.all(props.presentationId) })
const refreshPresentation = () => qc.invalidateQueries({ queryKey: presentationKeys.one(props.presentationId) })
const { task, status: taskStatus, error: taskError, start } = useAsyncTask(taskId, {
  storageKey: `presenton.task.avatars.${props.presentationId}`,
})
watch(
  generation,
  (g) => {
    if (g?.id && g.status === 'pending' && taskId.value !== g.id) start(g.id)
  },
  { immediate: true },
)
const running = computed(() => taskStatus.value === 'pending')
watch(taskStatus, (now, before) => {
  if (before === 'pending' && now !== 'pending') {
    void refreshVideos()
    void refreshPresentation()
  }
})
const plans = computed<AvatarSlidePlan[]>(() => (task.value?.data ? slidePlans(task.value) : slidePlans(generation.value)))
const planBySlide = computed(() => new Map(plans.value.map((p) => [p.slide_index, p])))
const doneCount = computed(() => plans.value.filter((p) => p.state === 'done').length)
watch(doneCount, (now, before) => {
  if (running.value && now > before) void refreshVideos()
})
const progress = computed(() => {
  const total = plans.value.filter((p) => p.state !== 'skipped').length
  return total ? Math.round(((doneCount.value + plans.value.filter((p) => p.state === 'failed').length) / total) * 100) : 0
})

// Why "Generate avatars" is unavailable, or null.
const disabledReason = computed<string | null>(() => {
  if (videos.value && !videos.value.generation_available) return 'Set HEYGEN_API_KEY on the server to generate avatars.'
  if (!videos.value?.portrait) return 'Upload a presenter portrait first.'
  if (running.value) return 'An avatar generation is already running.'
  const chosen = slides.value.filter((s) => selected.value.has(s.index))
  if (!chosen.length) return 'Choose at least one slide.'
  if (!tts.value) return 'Checking narration…'
  for (const s of chosen) {
    const blocker = slideBlocker(hasVideoPlaceholder(s), narrationOf(s))
    if (blocker) return `Slide ${s.index + 1} ${blocker}.`
  }
  return null
})

const confirming = ref(false)
const generate = useMutation({
  mutationFn: (force: boolean) =>
    startAvatarGeneration(props.presentationId, {
      slide_indices: [...selected.value].sort((a, b) => a - b),
      language: language.value || undefined,
      force,
    }),
  onSuccess: (t) => {
    confirming.value = false
    if (t.id) start(t.id)
    void qc.invalidateQueries({ queryKey: videoKeys.generation(props.presentationId) })
  },
  onError: (e) => {
    confirming.value = false
    fail(e)
  },
})

// Portrait
const portraitMut = useMutation({
  mutationFn: async (file: File | null) => {
    if (file) await uploadPortrait(props.presentationId, file)
    else await deletePortrait(props.presentationId)
  },
  onSuccess: refreshVideos,
  onError: fail,
})

// Per-slide actions
const busy = ref(new Set<number>())
async function withBusy(index: number, run: () => Promise<unknown>) {
  busy.value = new Set(busy.value).add(index)
  try {
    await run()
  } catch (e) {
    fail(e)
  } finally {
    const next = new Set(busy.value)
    next.delete(index)
    busy.value = next
  }
}
// Placeholders are a layer of the slide's `ui`, so the canvas needs the new presentation.
const togglePlaceholder = (s: Slide, on: boolean) =>
  withBusy(s.index, async () => {
    if (on) await addPlaceholder(props.presentationId, s.index)
    else await removePlaceholder(props.presentationId, s.index)
    await Promise.all([refreshPresentation(), refreshVideos()])
  })
const uploadVideo = (s: Slide, file: File) =>
  withBusy(s.index, async () => {
    await uploadSlideVideo(props.presentationId, s.index, file)
    await Promise.all([refreshPresentation(), refreshVideos()])
  })
const removeVideo = (s: Slide) =>
  withBusy(s.index, async () => {
    await deleteSlideVideo(props.presentationId, s.index)
    await refreshVideos()
  })
</script>

<template>
  <section class="flex flex-col gap-4 p-3" aria-label="Video">
    <PortraitCard
      :portrait="videos?.portrait"
      :busy="portraitMut.isPending.value"
      @upload="portraitMut.mutate($event)"
      @remove="portraitMut.mutate(null)"
    />

    <div class="flex flex-col gap-2">
      <h3 class="text-[12px] font-semibold text-[#f6f8f9]">Avatars</h3>
      <Button size="sm" :disabled="disabledReason !== null" aria-describedby="avatar-reason" @click="confirming = true">
        Generate avatars
      </Button>
      <p v-if="disabledReason" id="avatar-reason" class="text-[11px] text-muted" data-testid="avatar-reason">{{ disabledReason }}</p>
      <div v-if="running" class="flex flex-col gap-1" role="status">
        <Progress :model-value="progress" aria-label="Avatar generation progress" />
        <span class="text-[11px] text-muted">{{ task?.message || 'Generating avatars…' }}</span>
      </div>
      <p v-if="taskError" role="alert" class="text-[11px] text-danger-text">{{ taskError }}</p>
    </div>

    <div v-if="activeSlide" class="flex flex-col gap-2">
      <h3 class="text-[12px] font-semibold text-[#f6f8f9]">Voice bubble</h3>
      <p class="text-[11px] text-muted">Where the narrator sits on slides without an avatar. Applies to the whole deck.</p>
      <div class="relative overflow-hidden rounded-control border border-white/[0.06]">
        <SlideView :slide="activeSlide" :theme="presentation.theme" :fonts="presentation.fonts" fit="width" class="pointer-events-none" />
        <BubblePlacer :presentation-id="presentationId" :slide="activeSlide" />
      </div>
    </div>

    <ul class="flex flex-col gap-2" aria-label="Slide videos">
      <SlideVideoRow
        v-for="s in slides"
        :key="s.id ?? s.index"
        :slide="s"
        :has-placeholder="hasVideoPlaceholder(s)"
        :narration="narrationOf(s)"
        :video="videoBySlide.get(s.index)"
        :plan="planBySlide.get(s.index)"
        :preview-reason="previewReason.get(s.index)"
        :selected="selected.has(s.index)"
        :busy="busy.has(s.index)"
        @update:selected="setSelected(s.index, $event)"
        @update:placeholder="togglePlaceholder(s, $event)"
        @upload="uploadVideo(s, $event)"
        @remove-video="removeVideo(s)"
      />
    </ul>

    <GenerateAvatarsDialog
      v-model:open="confirming"
      :count="selected.size"
      :language="language"
      :pending="generate.isPending.value"
      @confirm="generate.mutate($event)"
    />
  </section>
</template>
