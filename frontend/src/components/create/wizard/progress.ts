import { i18n } from '@/i18n'

/** URL keys: `avatar` is the Narration step (step 5). The keys are kept so existing links keep working. */
export type WizardStepKey = 'topic' | 'presenter' | 'outline' | 'preview' | 'avatar' | 'export'
export type DeckStepKey = 'outline' | 'preview' | 'avatar' | 'export'

export const WIZARD_STEPS: readonly { key: WizardStepKey; readonly label: string }[] = [
  { key: 'topic', get label() { return i18n.global.t('create.steps.topic') } },
  { key: 'presenter', get label() { return i18n.global.t('create.steps.presenter') } },
  { key: 'outline', get label() { return i18n.global.t('create.steps.outline') } },
  { key: 'preview', get label() { return i18n.global.t('create.steps.preview') } },
  { key: 'avatar', get label() { return i18n.global.t('create.steps.avatar') } },
  { key: 'export', get label() { return i18n.global.t('create.steps.export') } },
]

export type StepState = 'done' | 'available' | 'locked' | 'running'

export interface StepStatus {
  state: StepState
  reason: string | null
}

export interface WizardStepItem extends StepStatus {
  key: WizardStepKey
  label: string
  summary: string
}

export interface DeckProgressInput {
  slideCount: number
  outlineStreaming: boolean
  slidesStreaming: boolean
  /** `ready` counts both 'ready' and 'translated' narration. */
  narration: { ready: number; stale: number }
  avatar: {
    placeholderSlides: number
    withVideo: number
    generationAvailable: boolean | undefined
  }
  pipelineRunning: boolean
}

export interface DeckProgress {
  steps: Record<DeckStepKey, StepStatus>
  /** Placeholders exist but avatar generation is unavailable. */
  voiceOnly: boolean
  /** What Narration has not done yet. Export warns about it but is never blocked by it. */
  missing: { narration: number; presenterVideos: number }
  resume: DeckStepKey
}

const previewLock = () => i18n.global.t('create.progress.generateFirst')
const avatarLock = () => i18n.global.t('create.progress.slidesFinish')

const status = (state: StepState, reason: string | null = null): StepStatus => ({
  state,
  reason: state === 'locked' ? reason : null,
})

export function deckProgress(i: DeckProgressInput): DeckProgress {
  const { slideCount, narration, avatar } = i
  const generationOk = avatar.generationAvailable !== false

  const voiceOnly = avatar.placeholderSlides > 0 && !generationOk
  // Narration is recommended, never required: it does not gate Export.
  const presenterWork = avatar.placeholderSlides > 0 && generationOk

  const outlineDone = slideCount > 0 || i.slidesStreaming
  const outline = status(
    i.outlineStreaming ? 'running' : outlineDone ? 'done' : 'available',
  )

  const preview = status(
    !outlineDone
      ? 'locked'
      : i.slidesStreaming
        ? 'running'
        : slideCount > 0
          ? 'done'
          : 'available',
    previewLock(),
  )
  const previewDone = preview.state === 'done'

  const avatarDone =
    slideCount > 0 &&
    narration.ready === slideCount &&
    (!presenterWork || avatar.withVideo >= avatar.placeholderSlides)
  const avatarStep = status(
    !previewDone ? 'locked' : i.pipelineRunning ? 'running' : avatarDone ? 'done' : 'available',
    avatarLock(),
  )

  // Export is open as soon as the slides are in; missing narration or presenter videos only warn (see ExportStep).
  const exportStep = status(previewDone ? 'available' : 'locked', avatarLock())

  const steps: Record<DeckStepKey, StepStatus> = {
    outline,
    preview,
    avatar: avatarStep,
    export: exportStep,
  }
  const resume: DeckStepKey =
    (['outline', 'preview', 'avatar'] as const).find(
      (k) => steps[k].state !== 'done',
    ) ?? 'export'

  const missing = {
    narration: Math.max(0, slideCount - narration.ready),
    // With no video generation (voice only) the bubble is all there is: nothing to wait for.
    presenterVideos: presenterWork ? Math.max(0, avatar.placeholderSlides - avatar.withVideo) : 0,
  }

  return { steps, voiceOnly, missing, resume }
}
