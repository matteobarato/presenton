export const FOOTER_MIN_HEIGHT = 96
export const FOOTER_DEFAULT_HEIGHT = 200
/** The footer body may take at most this share of the slide card's height. */
export const FOOTER_MAX_RATIO = 0.6
/** Px moved per arrow-key press on the resize handle. */
export const FOOTER_KEY_STEP = 16

/** Clamp a footer body height (px) to [min, 60% of the card]; the minimum wins when the card is tiny. */
export function clampFooterHeight(height: number, cardHeight: number): number {
  const max = Math.floor(cardHeight * FOOTER_MAX_RATIO)
  return Math.max(FOOTER_MIN_HEIGHT, Math.min(height, max))
}
