import { defineComponent, h, type Component, type PropType } from 'vue'
import DeckStateProvider from '@/components/editor/DeckStateProvider.vue'

/** Mounts a tab under the DeckStateProvider the editor page wraps it in; props pass straight through. */
export function deckHost(Tab: Component) {
  return defineComponent({
    props: { presentationId: { type: String, required: true }, presentation: { type: Object, required: true }, activeSlide: { type: Object as PropType<Record<string, unknown> | null>, default: null } },
    setup: (p) => () =>
      h(DeckStateProvider, { presentationId: p.presentationId, presentation: p.presentation as never }, () => h(Tab, { ...p })),
  })
}
