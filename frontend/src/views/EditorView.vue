<script setup lang="ts">
import { useEditorFetchGate } from '@/composables/useEditorFetchGate'
import { computed, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { usePresentation } from '@/api/presentations'
import { ApiError } from '@/api/errors'
import { Skeleton } from '@/components/ui/skeleton'
import EditorCanvas from '@/components/editor/EditorCanvas.vue'
import EditorHeader from '@/components/editor/EditorHeader.vue'
import EditorLayout from '@/components/editor/EditorLayout.vue'
import ChatPanel from '@/components/editor/chat/ChatPanel.vue'
import EditorStatusBar from '@/components/editor/EditorStatusBar.vue'
import ExportDialog from '@/components/editor/ExportDialog.vue'
import GenerationMetrics from '@/components/editor/GenerationMetrics.vue'
import Inspector from '@/components/editor/Inspector.vue'
import SlideNavigator from '@/components/editor/SlideNavigator.vue'
import SpeakerNotes from '@/components/editor/SpeakerNotes.vue'
import { slideLabel } from '@/lib/slide-label'
import { useElementTabAutoSwitch } from '@/composables/useElementTabAutoSwitch'
import { useSelectionScope } from '@/composables/useSelectionScope'
import { useSlideEditing } from '@/slide-editor/useSlideEditing'
import { useEditorShortcuts } from '@/composables/useEditorShortcuts'
import { usePresentationStream } from '@/composables/usePresentationStream'
import { slideKey, useEditorStore } from '@/stores/editor'
import { useHistoryStore } from '@/stores/history'

const route = useRoute()
const router = useRouter()
const editor = useEditorStore()
const history = useHistoryStore()

const id = computed(() => String(route.params.id ?? ''))
const { data: presentation, error, isError, refetch } = usePresentation(id, useEditorFetchGate())
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
  (list, previous) => {
    editor.slideIds = list.map(slideKey)
    if (list.some((s) => slideKey(s) === editor.activeSlideId)) return
    // The active slide vanished. An AI edit re-ids a slide in place, so stay at its position instead of jumping to the first.
    const lastIndex = Math.max(0, previous?.findIndex((s) => slideKey(s) === editor.activeSlideId) ?? 0)
    const target = list[Math.min(lastIndex, list.length - 1)]
    editor.select(target ? slideKey(target) : null)
  },
  { immediate: true },
)

const activeIndex = computed(() => Math.max(0, slides.value.findIndex((s) => slideKey(s) === editor.activeSlideId)))
const activeSlide = computed(() => slides.value[activeIndex.value] ?? null)
// Provides the slide's editing state to the canvas and the inspector's Element tab.
const editing = useSlideEditing(id, activeSlide)
useElementTabAutoSwitch(editing)
useSelectionScope(editing)
const notFound = computed(() => error.value instanceof ApiError && error.value.status === 404)

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

    <div v-else-if="!presentation" class="flex h-full flex-col" aria-busy="true" aria-label="Loading presentation">
      <div class="h-[83px] flex-none" />
      <div class="flex min-h-0 flex-1 gap-3 pr-4 pl-3">
        <Skeleton class="h-full w-[180px] rounded-panel max-[760px]:hidden" />
        <Skeleton class="h-full flex-1 rounded-panel" />
        <Skeleton class="h-full w-[280px] rounded-panel max-[1050px]:hidden" />
      </div>
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
        <!-- Aera canvas card: floating tools, slide stage and status row, then the speaker-notes footer. -->
        <div class="flex min-h-0 flex-1 flex-col rounded-panel bg-canvas max-[760px]:rounded-[13px]">
          <EditorCanvas :presentation-id="id" :slide="activeSlide">
            <template #status>
              <EditorStatusBar :position="activeIndex + 1" :total="slides.length" :label="slideLabel(activeSlide)" />
            </template>
          </EditorCanvas>
          <SpeakerNotes :presentation-id="id" :slide="activeSlide" />
        </div>

        <template #inspector><Inspector /></template>
        <template #chat><ChatPanel :presentation-id="id" :presentation="presentation" :active-slide="activeSlide" /></template>
      </EditorLayout>
      <ExportDialog :presentation="presentation" />
    </template>
  </div>
</template>
