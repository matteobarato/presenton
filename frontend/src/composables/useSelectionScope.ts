import { useEventListener } from '@vueuse/core'
import type { SlideEditing } from '@/slide-editor/useSlideEditing'

/** Marks the slide navigator (docked or drawer): pressing or focusing in it leaves the slide. */
const SLIDE_NAVIGATOR_ATTR = 'data-slide-navigator'

const inNavigator = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest(`[${SLIDE_NAVIGATOR_ATTR}]`)

/**
 * The on-slide selection lives while the user works on the slide. A press or focus in the slide
 * navigator clears it, so the keys there (arrows, Delete) act on slides, not on a stale element.
 */
export function useSelectionScope(ctx: Pick<SlideEditing, 'selection' | 'select'>) {
  const leave = (e: Event) => {
    if (ctx.selection.value !== null && inNavigator(e.target)) ctx.select(null)
  }
  useEventListener(document, 'pointerdown', leave, { capture: true })
  useEventListener(document, 'focusin', leave)
}
