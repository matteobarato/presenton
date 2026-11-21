import { TONES, VERBOSITIES, type CreateOptions } from './options'

/**
 * One-line summaries of the create settings: the text on the setup chips (and what the step bar shows for
 * the Topic step). Pure, so the chips of a new deck and the read-only chips of a created deck read the same.
 */

/** The Presenter step's one-word state, for the step bar: a photo, a presenter still waiting for one, or voice only. */
export const presenterSummary = (hasPhoto: boolean, wantsPresenter = false) =>
  hasPhoto ? 'Photo set' : wantsPresenter ? 'Photo needed' : 'Voice only'

export function lengthSummary(slides: string): string {
  return slides ? `${slides} ${slides === '1' ? 'slide' : 'slides'}` : 'Auto length'
}

/** Images only: the presenter video count is chosen on the Presenter step. */
export function mediaSummary(o: Pick<CreateOptions, 'images'>): string {
  return o.images === '' ? 'Auto images' : o.images === '0' ? 'No images' : `${o.images} with images`
}

export const lengthMediaSummary = (o: CreateOptions) => `${lengthSummary(o.slides)} · ${mediaSummary(o)}`

const toneLabel = (tone: CreateOptions['tone']) => TONES.find((t) => t.value === tone)?.label ?? String(tone)
const verbosityLabel = (v: CreateOptions['verbosity']) => VERBOSITIES.find((x) => x.value === v)?.label ?? String(v)

/** `Tone: Default`, plus `Text per slide: Concise` when the text per slide is not the standard amount. */
export function styleSummary(tone: CreateOptions['tone'], verbosity: CreateOptions['verbosity']): string {
  return [`Tone: ${toneLabel(tone)}`, verbosity === 'standard' ? '' : `Text per slide: ${verbosityLabel(verbosity)}`].filter(Boolean).join(' · ')
}

/** What the Extras chip says: the switched-on extras, or that none are. */
export function extrasSummary(o: CreateOptions): string {
  const on = [
    o.includeTitleSlide && 'Title slide',
    o.includeTableOfContents && 'Contents',
    o.webSearch && 'Web search',
    o.animate && 'Animated',
    o.instructions.trim() && 'Instructions',
  ].filter(Boolean)
  return on.length ? on.join(' · ') : 'None'
}

/**
 * The presenter chip's note. The video count is only a request: 'Auto' leaves the number of presenter slots to
 * the writer and the template, so it is not known before the outline.
 */
export function presenterNote(hasPhoto: boolean, videos: string): string | null {
  if (!hasPhoto) return null
  const n = Number(videos)
  if (videos === '0') return 'No presenter videos requested, so the photo will not be used on any slide.'
  if (videos !== '' && n > 0) return `Adds ${n} presenter ${n === 1 ? 'video' : 'videos'} at the Narration step`
  return 'Presenter videos are rendered at the Narration step. The writer and template decide how many slides get one.'
}
