<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ArrowRight, Pencil, Play, UserRound } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { Button } from '@/components/ui/button'
import AiProgress from '@/components/shell/AiProgress.vue'
import GenerationMetrics from '@/components/editor/GenerationMetrics.vue'
import { hasVideoPlaceholder } from '@/components/editor/inspector/video/avatar-state'
import WizardStepFooter from '@/components/create/wizard/WizardStepFooter.vue'
import type { DeckProgress, DeckStepKey } from '@/components/create/wizard/progress'
import { usePresentationStream } from '@/composables/usePresentationStream'
import { usePlanMotionAfterGeneration } from '@/composables/usePlanMotionAfterGeneration'
import SlideView from '@/render/SlideView.vue'
import SlideLightbox from './SlideLightbox.vue'

/**
 * Step 5: watch the slides arrive (`?stream=1`), then look them over. Thumbnails open a lightbox; tuning a
 * slide is the editor's job. A deck created with "Animate slides" gets its motion planned once generation ends.
 */
const props = defineProps<{ presentation: Presentation; progress: DeckProgress }>()
const emit = defineEmits<{ streaming: [value: boolean] }>()

const route = useRoute()
const router = useRouter()
const id = computed(() => props.presentation.id)

// ── Live generation ──
const streamFlag = computed(() => ['1', 'true'].includes(String(route.query.stream ?? '')))
/** Briefly true on Retry, so the stream's `[id, enabled]` watcher sees a fresh start. */
const paused = ref(false)
const enabled = computed(() => streamFlag.value && !paused.value)
const { status, metrics } = usePresentationStream(id, enabled)
const { planning } = usePlanMotionAfterGeneration(id, status)

const streaming = computed(() => status.value === 'streaming')
// Also turns false on an error: Preview then counts as done if any slide was saved.
watch(streaming, (v) => emit('streaming', v), { immediate: true })
watch(status, (s) => {
  if (s !== 'done') return
  // Slides are in; the deck itself is refetched by the stream on completion.
  const query = { ...route.query }
  delete query.stream
  void router.replace({ query })
})
onBeforeUnmount(() => emit('streaming', false))

async function retry() {
  paused.value = true
  await nextTick()
  paused.value = false
}

const slides = computed(() => props.presentation.slides)
const total = computed(() => Math.max(props.presentation.n_slides ?? 0, slides.value.length))
const pending = computed(() => (streaming.value ? Math.max(0, total.value - slides.value.length) : 0))
const generatingLabel = computed(() => `Generating slide ${Math.min(slides.value.length + 1, total.value)} of ${total.value}…`)
const showMetrics = computed(() => streamFlag.value || streaming.value)

// ── Lightbox ──
const lightboxIndex = ref<number | null>(null)
let opener: HTMLElement | null = null
function openSlide(i: number, e: MouseEvent) {
  opener = e.currentTarget as HTMLElement
  lightboxIndex.value = i
}
const restoreFocus = () => opener?.focus()

// ── Footer ──
const avatarNext = computed(() => props.progress.avatarRequirement !== 'optional')
const streamError = computed(() =>
  status.value === 'error' ? 'Slide generation stopped before the deck was finished.' : null,
)
const footerStatus = computed(() => {
  if (streaming.value) return generatingLabel.value
  if (!slides.value.length) return status.value === 'error' ? 'Retry to generate the slides' : 'No slides yet'
  const n = slides.value.length
  return `${n} ${n === 1 ? 'slide' : 'slides'} ready`
})
const canContinue = computed(() => !streaming.value && slides.value.length > 0)

/** Leaves Preview: the stream flag belongs to this step only. */
function go(step: DeckStepKey) {
  const query = { ...route.query }
  delete query.stream
  void router.push({ name: 'create', params: { id: id.value, step }, query })
}
function editSlides() {
  void router.push({ name: 'editor', params: { id: id.value } })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <GenerationMetrics v-if="showMetrics" :metrics="metrics" :status="status" :slide-count="slides.length" />
    <Transition name="step-panel">
      <AiProgress
        v-if="planning"
        class="mx-auto w-full max-w-[520px]"
        stage="Planning motion for every slide…"
        label="Deck motion planning"
        :expected-ms="60_000"
      />
    </Transition>

    <ol class="grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 max-[520px]:grid-cols-2 max-[520px]:gap-2.5" data-testid="preview-grid">
      <li v-for="(slide, i) in slides" :key="slide.id ?? `slide-${i}`" class="flex min-w-0 flex-col gap-1.5">
        <button
          type="button"
          class="group relative block overflow-hidden rounded-[9px] border border-white/[0.07] bg-[#101416] p-0 text-left transition-colors duration-200 hover:border-[#7f9fab] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent"
          :aria-label="`Open slide ${i + 1}`"
          @click="openSlide(i, $event)"
        >
          <SlideView
            :slide="slide"
            :theme="presentation.theme"
            :fonts="presentation.fonts"
            fit="width"
            lazy
            class="pointer-events-none overflow-hidden"
          />
          <span
            v-if="hasVideoPlaceholder(slide)"
            class="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-[#0c1114d9] px-2 py-0.5 text-[10px] font-medium text-[#d4dee3] backdrop-blur-sm"
            data-testid="presenter-marker"
          >
            <UserRound class="size-3" aria-hidden="true" />Presenter
          </span>
        </button>
        <span class="px-0.5 text-[10px] text-[#899296] tabular-nums" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>
      </li>
      <li v-for="n in pending" :key="`pending-${n}`" class="flex flex-col gap-1.5" aria-hidden="true">
        <div class="skeleton-shimmer aspect-video rounded-[9px]" data-testid="preview-skeleton" />
        <span class="px-0.5 text-[10px] text-[#5f6b71] tabular-nums">{{ String(slides.length + n).padStart(2, '0') }}</span>
      </li>
    </ol>
  </div>

  <SlideLightbox
    v-model:index="lightboxIndex"
    :slides="slides"
    :theme="presentation.theme"
    :fonts="presentation.fonts"
    :title="presentation.title?.trim() || 'Presentation'"
    @closed="restoreFocus"
  />

  <WizardStepFooter :status="footerStatus" :error="streamError" :busy="streaming" @retry="retry">
    <template #secondary>
      <Button as-child variant="ghost">
        <RouterLink :to="{ name: 'present', params: { id } }"><Play class="size-4" aria-hidden="true" />Present</RouterLink>
      </Button>
      <Button type="button" variant="outline" @click="editSlides">
        <Pencil class="size-4" aria-hidden="true" />Edit slides
      </Button>
    </template>
    <template #primary>
      <Button v-if="avatarNext" type="button" :disabled="!canContinue" @click="go('avatar')">
        Looks good — continue to Avatar<ArrowRight class="size-4" aria-hidden="true" />
      </Button>
      <template v-else>
        <Button type="button" variant="ghost" :disabled="!canContinue" @click="go('export')">Skip to Export</Button>
        <Button type="button" :disabled="!canContinue" @click="go('avatar')">
          Continue<ArrowRight class="size-4" aria-hidden="true" />
        </Button>
      </template>
    </template>
  </WizardStepFooter>
</template>
