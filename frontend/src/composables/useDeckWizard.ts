import { computed, type ComputedRef, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import type { Presentation } from '@/api/types'
import { useTts } from '@/api/tts'
import { getVideos, videoKeys } from '@/api/videos'
import { listTemplates, templatesKey, type TemplateSummary } from '@/api/templates'
import { injectDeckNarration } from '@/components/editor/inspector/narration/useDeckNarration'
import { injectDeckAvatars } from '@/components/editor/inspector/video/useDeckAvatars'
import { isFreshVideo } from '@/components/editor/inspector/video/avatar-state'
import { blockTemplateId } from '@/slide-editor/insert/templateBlocks'
import { readDeckLook } from '@/composables/useDeckLook'
import {
  deckProgress,
  WIZARD_STEPS,
  type DeckProgress,
  type DeckStepKey,
  type WizardStepItem,
} from '@/components/create/wizard/progress'

export interface DeckWizardOptions {
  slidesStreaming: Ref<boolean>
  outlineStreaming: Ref<boolean>
  pipelineRunning: Ref<boolean>
  /**
   * Template id to name the Look step by when the slides don't say (e.g. `?template=` before slides exist);
   * else the deck's remembered look.
   */
  templateId?: Ref<string | null | undefined>
}

const TOPIC_MAX = 60
const clip = (s: string, max = TOPIC_MAX) => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one
}

/**
 * Wizard progress of an existing deck: the step states and the seven step-bar items. Must run inside
 * `DeckStateProvider` (narration and avatar state come from it).
 */
export function useDeckWizard(
  id: Ref<string>,
  presentation: Ref<Presentation>,
  opts: DeckWizardOptions,
): {
  progress: ComputedRef<DeckProgress>
  items: ComputedRef<WizardStepItem[]>
  ready: ComputedRef<boolean>
  template: ComputedRef<TemplateSummary | null>
} {
  const narration = injectDeckNarration()
  const avatars = injectDeckAvatars()

  // Same keys as the deck state's own queries, so nothing is fetched twice; these only say when the
  // answers are in. Until then progress would read "nothing narrated, no videos" and lock steps that aren't.
  const videosQuery = useQuery({ queryKey: () => videoKeys.all(id.value), queryFn: () => getVideos(id.value) })
  const ttsQuery = useTts(id, narration.language)

  const slideCount = computed(() => presentation.value.slides.length)
  const ready = computed(
    () => slideCount.value === 0 || (videosQuery.isFetched.value && ttsQuery.isFetched.value),
  )

  const progress = computed(() => {
    const placeholders = avatars.placeholderSlides.value
    const counts = narration.counts.value
    return deckProgress({
      slideCount: slideCount.value,
      outlineStreaming: opts.outlineStreaming.value,
      slidesStreaming: opts.slidesStreaming.value,
      narration: { ready: counts.ready + counts.translated, stale: counts.stale },
      avatar: {
        placeholderSlides: placeholders.length,
        withVideo: placeholders.filter((s) => isFreshVideo(avatars.videoBySlide.value.get(s.id))).length,
        generationAvailable: avatars.videos.value?.generation_available,
      },
      pipelineRunning: opts.pipelineRunning.value,
    })
  })

  const templates = useQuery({ queryKey: templatesKey, queryFn: listTemplates })
  const template = computed(() => {
    const tid =
      blockTemplateId(presentation.value.slides) ?? opts.templateId?.value ?? readDeckLook(id.value)?.template ?? null
    return (tid && templates.data.value?.find((t) => t.id === tid)) || null
  })
  const templateName = computed(() => template.value?.name || 'Template')

  const items = computed<WizardStepItem[]>(() => {
    const p = presentation.value
    const n = slideCount.value
    const counts = narration.counts.value
    const summaries: Record<string, string> = {
      topic: [clip(p.content ?? '', 40), templateName.value].filter(Boolean).join(' · '),
      presenter: [avatars.videos.value?.portrait ? 'Photo set' : 'No avatar', p.language].filter(Boolean).join(' · '),
      details: [`${p.n_slides} slides`, p.tone, p.verbosity].filter(Boolean).join(' · '),
      outline: n ? `${n} slides` : '',
      preview: '',
      avatar: n ? `${counts.ready + counts.translated} of ${n} narrated` : '',
      export: '',
    }
    return WIZARD_STEPS.map(({ key, label }) => {
      const status =
        key === 'topic' || key === 'presenter' || key === 'details'
          ? { state: 'done' as const, reason: null, badge: null }
          : progress.value.steps[key as DeckStepKey]
      return { key, label, summary: summaries[key] ?? '', ...status }
    })
  })

  return { progress, items, ready, template }
}
