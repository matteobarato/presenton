<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { presentationKeys, usePresentation } from '@/api/presentations'
import { ApiError } from '@/api/errors'
import { Skeleton } from '@/components/ui/skeleton'
import AskOverlay from '@/components/editor/AskOverlay.vue'
import EditorCanvas from '@/components/editor/EditorCanvas.vue'
import EditorHeader from '@/components/editor/EditorHeader.vue'
import EditorLayout from '@/components/editor/EditorLayout.vue'
import EditorStatusBar from '@/components/editor/EditorStatusBar.vue'
import GenerationMetrics from '@/components/editor/GenerationMetrics.vue'
import Inspector from '@/components/editor/Inspector.vue'
import NotesStrip from '@/components/editor/NotesStrip.vue'
import SlideNavigator from '@/components/editor/SlideNavigator.vue'
import { useEditorShortcuts } from '@/composables/useEditorShortcuts'
import { usePresentationStream } from '@/composables/usePresentationStream'
import { slideKey, useEditorStore } from '@/stores/editor'
import { useHistoryStore } from '@/stores/history'

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const editor = useEditorStore()
const history = useHistoryStore()

const id = computed(() => String(route.params.id ?? ''))
const { data: presentation, error, isError, refetch } = usePresentation(id)
const slides = computed(() => presentation.value?.slides ?? [])

// `?stream=1` is set by the outline step: this deck is still being generated.
const streamRequested = computed(() => ['1', 'true'].includes(String(route.query.stream ?? '')))
const stream = usePresentationStream(id, streamRequested)
const generating = computed(() => stream.status.value === 'streaming')
watch(
  () => stream.status.value,
  (status) => {
    if (status !== 'done') return
    const query = { ...route.query }
    delete query.stream
    void router.replace({ query })
  },
)

useEditorShortcuts()

// A different deck starts with a clean selection and history.
watch(
  id,
  () => {
    editor.reset()
    history.clear()
  },
  { immediate: true },
)

watch(
  slides,
  (list) => {
    editor.slideIds = list.map(slideKey)
    if (!list.some((s) => slideKey(s) === editor.activeSlideId)) editor.select(list[0] ? slideKey(list[0]) : null)
  },
  { immediate: true },
)

const activeIndex = computed(() => Math.max(0, slides.value.findIndex((s) => slideKey(s) === editor.activeSlideId)))
const activeSlide = computed(() => slides.value[activeIndex.value] ?? null)
const notFound = computed(() => error.value instanceof ApiError && error.value.status === 404)

const reloadSlides = () => queryClient.invalidateQueries({ queryKey: presentationKeys.one(id.value) })
</script>

<template>
  <div class="h-full min-h-0 bg-shell">
    <div v-if="isError && !presentation" class="grid h-full place-items-center p-6 text-center" role="alert">
      <div class="space-y-3">
        <h1 class="font-display text-xl font-medium">{{ notFound ? 'Presentation not found' : 'Could not load this presentation' }}</h1>
        <p class="text-[13px] text-muted">{{ notFound ? 'It may have been deleted.' : (error as Error)?.message }}</p>
        <div class="flex justify-center gap-3 text-[12px] font-semibold">
          <button v-if="!notFound" type="button" class="rounded-button bg-secondary px-3 py-2 hover:bg-secondary-hover" @click="refetch()">Try again</button>
          <RouterLink :to="{ name: 'library' }" class="rounded-button bg-secondary px-3 py-2 hover:bg-secondary-hover">Back to library</RouterLink>
        </div>
      </div>
    </div>

    <div v-else-if="!presentation" class="flex h-full gap-3 p-3" aria-busy="true" aria-label="Loading presentation">
      <Skeleton class="h-full w-[180px] rounded-panel" />
      <Skeleton class="h-full flex-1 rounded-panel" />
    </div>

    <template v-else>
      <EditorLayout>
        <template #header><EditorHeader :presentation="presentation" /></template>
        <template #navigator><SlideNavigator :presentation-id="id" :slides="slides" /></template>

        <GenerationMetrics
          v-if="streamRequested || generating"
          :metrics="stream.metrics.value"
          :status="stream.status.value"
          :slide-count="slides.length"
        />
        <EditorCanvas :presentation-id="id" :slide="activeSlide" />
        <EditorStatusBar :position="activeIndex + 1" :total="slides.length" />
        <NotesStrip v-if="editor.notesOpen && activeSlide" :presentation-id="id" :slide="activeSlide" />

        <template #inspector><Inspector /></template>
      </EditorLayout>
      <AskOverlay v-if="activeSlide" v-model:open="editor.askOpen" :slide="activeSlide" @edited="reloadSlides" />
    </template>
  </div>
</template>
