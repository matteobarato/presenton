<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Pencil, Play, UserRound } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { Button } from '@/components/ui/button'
import AiProgress from '@/components/shell/AiProgress.vue'
import GenerationMetrics from '@/components/editor/GenerationMetrics.vue'
import { hasVideoPlaceholder } from '@/components/editor/inspector/video/avatar-state'
import type { FooterAction } from '@/components/create/wizard/stepFooter'
import WizardStepFooter from '@/components/create/wizard/WizardStepFooter.vue'
import type { DeckStepKey } from '@/components/create/wizard/progress'
import { usePresentationStream } from '@/composables/usePresentationStream'
import { usePlanMotionAfterGeneration } from '@/composables/usePlanMotionAfterGeneration'
import SlideView from '@/render/SlideView.vue'
import SlideLightbox from './SlideLightbox.vue'

/**
 * Step 4: watch the slides arrive (`?stream=1`), then look them over. Thumbnails open a lightbox; tuning a
 * slide is the editor's job. A deck created with "Animate slides" gets its motion planned once generation ends.
 */
const props = defineProps<{ presentation: Presentation }>()
const emit = defineEmits<{ streaming: [value: boolean] }>()

const route = useRoute()
const router = useRouter()
const id = computed(() => props.presentation.id)

// ── Live generation ──
const streamFlag = computed(() => ['1', 'true'].includes(String(route.query.stream ?? '')))
/** Briefly true on Retry, so the stream's `[id, enabled]` watcher sees a fresh start. */
const paused = ref(false)
const enabled = computed(() => streamFlag.value && !paused.value)
const { status, metrics, received } = usePresentationStream(id, enabled)
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

// While streaming, only the slides this stream delivered count: on Regenerate the cache still holds the old
// deck's slides until the new ones replace them.
const slides = computed(() =>
  streaming.value ? props.presentation.slides.filter((s) => received.value.has(s.index)) : props.presentation.slides,
)
const total = computed(() =>
  streaming.value ? Math.max(props.presentation.n_slides ?? 0, slides.value.length) : slides.value.length,
)
const pending = computed(() => (streaming.value ? Math.max(0, total.value - slides.value.length) : 0))
const generatingLabel = computed(() =>
  slides.value.length >= total.value ? 'Finishing up…' : `Generating slide ${slides.value.length + 1} of ${total.value}…`,
)
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
const streamError = computed(() =>
  status.value === 'error' ? 'Slide generation stopped before all slides were made. Choose Retry to try again.' : null,
)
const footerStatus = computed(() => {
  if (streaming.value) return `${generatingLabel.value} Other actions open when it finishes.`
  if (!slides.value.length) return status.value === 'error' ? 'Retry to generate the slides' : 'No slides yet. Go back to the outline to generate them.'
  const n = slides.value.length
  return `${n} ${n === 1 ? 'slide' : 'slides'} ready`
})
/** Why Skip to Export is safe: narration can be added later (the editor has the same narration and presenter tools). */
const SKIP_REASON = 'Narration is optional: you can narrate later from the editor.'
const canContinue = computed(() => !streaming.value && slides.value.length > 0)

/** Leaves Preview: the stream flag belongs to this step only. */
function go(step: DeckStepKey) {
  const query = { ...route.query }
  delete query.stream
  void router.push({ name: 'create', params: { id: id.value, step }, query })
}
// Secondary actions: buttons beside the primary on wide screens, the More menu on phones. Narration is recommended: one
// primary, and Export stays a quiet text link past it.
const actions = computed<FooterAction[]>(() => [
  { key: 'present', label: 'Present', icon: Play, to: { name: 'present', params: { id: id.value } }, disabled: streaming.value },
  { key: 'edit', label: 'Edit slides', icon: Pencil, variant: 'outline', onSelect: editSlides, disabled: streaming.value },
  { key: 'skip', label: 'Skip to Export', link: true, testid: 'skip-to-export', onSelect: () => go('export'), disabled: !canContinue.value },
])
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
            class="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-[#0c1114d9] px-2 py-0.5 text-[12px] font-medium text-[#d4dee3] backdrop-blur-sm"
            data-testid="presenter-marker"
          >
            <UserRound class="size-3" aria-hidden="true" />Presenter
          </span>
        </button>
        <span class="px-0.5 text-[12px] text-[#899296] tabular-nums" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>
      </li>
      <li v-for="n in pending" :key="`pending-${n}`" class="flex flex-col gap-1.5" aria-hidden="true">
        <div class="skeleton-shimmer aspect-video rounded-[9px]" data-testid="preview-skeleton" />
        <span class="px-0.5 text-[12px] text-[#7b878d] tabular-nums">{{ String(slides.length + n).padStart(2, '0') }}</span>
      </li>
    </ol>
    <p v-if="canContinue" class="text-[12px] leading-[1.6] text-[#a9b8c0]" data-testid="skip-reason">{{ SKIP_REASON }}</p>
  </div>

  <SlideLightbox
    v-model:index="lightboxIndex"
    :slides="slides"
    :theme="presentation.theme"
    :fonts="presentation.fonts"
    :title="presentation.title?.trim() || 'Presentation'"
    @closed="restoreFocus"
  />

  <!-- Leaving mid-generation aborts the stream and loses the deck: Back, Present and Edit wait (the status says why). -->
  <WizardStepFooter :status="footerStatus" :error="streamError" :busy="streaming" :back-disabled="streaming" :actions="actions" @retry="retry">
    <template #primary>
      <Button type="button" data-testid="continue-narration" :disabled="!canContinue" @click="go('avatar')">
        Continue to Narration<ArrowRight class="size-4" aria-hidden="true" />
      </Button>
    </template>
  </WizardStepFooter>
</template>
