export type WizardStepKey =
  | 'topic'
  | 'presenter'
  | 'details'
  | 'outline'
  | 'preview'
  | 'avatar'
  | 'export'
export type DeckStepKey = 'outline' | 'preview' | 'avatar' | 'export'

export const WIZARD_STEPS: readonly { key: WizardStepKey; label: string }[] = [
  { key: 'topic', label: 'Topic & look' },
  { key: 'presenter', label: 'Avatar & language' },
  { key: 'details', label: 'Details' },
  { key: 'outline', label: 'Outline' },
  { key: 'preview', label: 'Preview' },
  { key: 'avatar', label: 'Narration' },
  { key: 'export', label: 'Export' },
]

export type StepState = 'done' | 'available' | 'locked' | 'running'
export type AvatarRequirement = 'required' | 'optional' | 'undecided'

export interface StepStatus {
  state: StepState
  reason: string | null
  badge: string | null
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
  /** Never 'undecided' once slideCount > 0. */
  avatarRequirement: AvatarRequirement
  /** Placeholders exist but avatar generation is unavailable. */
  voiceOnly: boolean
  resume: DeckStepKey
}

export const AVATAR_BADGE: Record<AvatarRequirement, string> = {
  required: 'Required',
  optional: 'Optional',
  undecided: 'Decided after Preview',
}

const PREVIEW_LOCK = 'Generate slides from the outline first'
const AVATAR_LOCK = 'Slides must finish generating first'

/** Maps the Details-step "videos" option to what the Avatar step will need. */
export function avatarHint(videosOption: string): AvatarRequirement {
  if (videosOption === '') return 'undecided'
  if (videosOption === '0') return 'optional'
  return 'required'
}

const status = (
  state: StepState,
  reason: string | null = null,
  badge: string | null = null,
): StepStatus => ({ state, reason: state === 'locked' ? reason : null, badge })

export function deckProgress(i: DeckProgressInput): DeckProgress {
  const { slideCount, narration, avatar } = i
  const generationOk = avatar.generationAvailable !== false

  const voiceOnly = avatar.placeholderSlides > 0 && !generationOk
  const avatarRequirement: AvatarRequirement =
    slideCount === 0
      ? 'undecided'
      : avatar.placeholderSlides > 0 && generationOk
        ? 'required'
        : 'optional'
  const required = avatarRequirement === 'required'

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
    PREVIEW_LOCK,
  )
  const previewDone = preview.state === 'done'

  const avatarDone =
    slideCount > 0 &&
    narration.ready === slideCount &&
    (!required || avatar.withVideo >= avatar.placeholderSlides)
  const avatarStep = status(
    !previewDone
      ? 'locked'
      : i.pipelineRunning
        ? 'running'
        : avatarDone
          ? 'done'
          : 'available',
    AVATAR_LOCK,
    AVATAR_BADGE[avatarRequirement],
  )

  const missing = avatar.placeholderSlides - avatar.withVideo
  const exportLocked = !previewDone
    ? AVATAR_LOCK
    : required && !avatarDone
      ? missing > 0
        ? `${missing} ${missing === 1 ? 'slide still needs its' : 'slides still need their'} avatar`
        : 'Narrate every slide first'
      : null
  const exportStep = status(exportLocked ? 'locked' : 'available', exportLocked)

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

  return { steps, avatarRequirement, voiceOnly, resume }
}
