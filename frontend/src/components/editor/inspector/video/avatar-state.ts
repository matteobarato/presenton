import type { Slide } from '@/api/types'
import type { AvatarSlidePlan, SlideVideo } from '@/api/videos'
import type { NarrationState } from '../narration/narration-state'

export type AvatarChipKind =
  | 'ready'
  | 'no_placeholder'
  | 'no_audio'
  | 'audio_stale'
  | 'unsupported_audio'
  | 'generating'
  | 'failed'
  | 'done'
  | 'uploaded'
  | 'video_stale'

export const CHIP_LABEL: Record<AvatarChipKind, string> = {
  ready: 'Ready',
  no_placeholder: 'No placeholder',
  no_audio: 'No narration',
  audio_stale: 'Narration changed',
  unsupported_audio: 'Audio format',
  generating: 'Generating',
  failed: 'Failed',
  done: 'Generated',
  uploaded: 'Uploaded video',
  video_stale: 'Out of date',
}

const FAILURE_LABELS: Record<string, string> = {
  timeout: 'Timed out',
  internal_error: 'Internal error',
  invalid_output: 'Invalid video returned',
  configuration: 'HeyGen is not configured',
  request_error: 'Request failed',
  audio_error: 'Narration audio could not be read',
  unknown: 'Unknown error',
}

/** The provider's message for a failed slide, else a label for its reason. */
export function failureText(plan: Pick<AvatarSlidePlan, 'reason' | 'message'>): string {
  return plan.message || (plan.reason ? (FAILURE_LABELS[plan.reason] ?? plan.reason) : 'Generation failed')
}

/** Does the slide's `ui` carry the avatar placeholder layer (an element flagged `video_placeholder`)? */
export function hasVideoPlaceholder(slide: Pick<Slide, 'ui'>): boolean {
  const walk = (v: unknown): boolean => {
    if (Array.isArray(v)) return v.some(walk)
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      return o.video_placeholder === true || Object.values(o).some(walk)
    }
    return false
  }
  return walk(slide.ui)
}

/** Why a slide cannot get an avatar right now, or null. Narration must be up to date: avatars are lip-synced to it. */
export function slideBlocker(hasPlaceholder: boolean, narration: NarrationState): string | null {
  if (!hasPlaceholder) return 'has no avatar placeholder'
  if (narration === 'missing') return 'has no narration yet'
  if (narration === 'stale') return 'narration changed since it was recorded'
  return null
}

export function chipFor(input: {
  plan?: AvatarSlidePlan
  hasPlaceholder: boolean
  narration: NarrationState
  video?: SlideVideo
  previewReason?: string | null
}): AvatarChipKind {
  const { plan, hasPlaceholder, narration, video, previewReason } = input
  if (plan?.state === 'queued' || plan?.state === 'generating') return 'generating'
  if (plan?.state === 'failed') return 'failed'
  if (video?.source === 'upload') return 'uploaded'
  if (!hasPlaceholder) return 'no_placeholder'
  if (narration === 'missing') return 'no_audio'
  if (narration === 'stale') return 'audio_stale'
  if (video) return video.stale ? 'video_stale' : 'done'
  if (plan?.state === 'done') return 'done'
  if (previewReason === 'unsupported_audio_format') return 'unsupported_audio'
  return 'ready'
}
