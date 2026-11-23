import { i18n } from '@/i18n'
import { TONES, VERBOSITIES, type CreateOptions } from './options'

/**
 * One-line summaries of the create settings: the text on the setup chips (and what the step bar shows for
 * the Topic step). Pure, so the chips of a new deck and the read-only chips of a created deck read the same.
 */

const t = (key: string, named?: Record<string, unknown>, plural?: number) =>
  named === undefined ? i18n.global.t(key) : i18n.global.t(key, named, plural ?? 1)

/** The Presenter step's one-word state, for the step bar: a photo, a presenter still waiting for one, or voice only. */
export const presenterSummary = (hasPhoto: boolean, wantsPresenter = false) =>
  hasPhoto ? t('create.summary.photoSet') : wantsPresenter ? t('create.summary.photoNeeded') : t('create.summary.voiceOnly')

export function lengthSummary(slides: string): string {
  return slides ? t('create.summary.slides', { count: slides }, Number(slides)) : t('create.summary.autoLength')
}

/** Images only: the presenter video count is chosen on the Presenter step. */
export function mediaSummary(o: Pick<CreateOptions, 'images'>): string {
  return o.images === '' ? t('create.summary.autoImages') : o.images === '0' ? t('create.summary.noImages') : t('create.summary.withImages', { count: o.images }, Number(o.images))
}

export const lengthMediaSummary = (o: CreateOptions) => `${lengthSummary(o.slides)} · ${mediaSummary(o)}`

const toneLabel = (tone: CreateOptions['tone']) => TONES.find((x) => x.value === tone)?.label ?? String(tone)
const verbosityLabel = (v: CreateOptions['verbosity']) => VERBOSITIES.find((x) => x.value === v)?.label ?? String(v)

/** `Tone: Default`, plus `Text per slide: Concise` when the text per slide is not the standard amount. */
export function styleSummary(tone: CreateOptions['tone'], verbosity: CreateOptions['verbosity']): string {
  return [
    t('create.summary.tone', { tone: toneLabel(tone) }),
    verbosity === 'standard' ? '' : t('create.summary.textPerSlide', { level: verbosityLabel(verbosity) }),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** What the Extras chip says: the switched-on extras, or that none are. */
export function extrasSummary(o: CreateOptions): string {
  const on = [
    o.includeTitleSlide && t('create.summary.titleSlide'),
    o.includeTableOfContents && t('create.summary.contents'),
    o.webSearch && t('create.summary.webSearch'),
    o.animate && t('create.summary.animated'),
    o.instructions.trim() && t('create.summary.instructions'),
  ].filter(Boolean)
  return on.length ? on.join(' · ') : t('create.summary.none')
}

/**
 * The presenter chip's note. The video count is only a request: 'Auto' leaves the number of presenter slots to
 * the writer and the template, so it is not known before the outline.
 */
export function presenterNote(hasPhoto: boolean, videos: string): string | null {
  if (!hasPhoto) return null
  const n = Number(videos)
  if (videos === '0') return t('create.summary.presenterNone')
  if (videos !== '' && n > 0) return t('create.summary.presenterAdds', { count: n }, n)
  return t('create.summary.presenterAuto')
}
