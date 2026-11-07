import { computed, inject, type ComputedRef, type InjectionKey } from 'vue'
import type { TemplateV2ItemSource } from '@/render/legacy/lib/template-v2-json-to-html'

/** What EditableSlide gives its overlay: the rendered layer of a model item. */
export interface EditableCanvas {
  layerFor: (source: TemplateV2ItemSource) => HTMLElement | null
  /** Id of the slide this canvas renders (a leaving slide keeps its own). */
  slideId: ComputedRef<string | null>
}

export const EDITABLE_CANVAS_KEY: InjectionKey<EditableCanvas> = Symbol('editable-canvas')

export function useEditableCanvas(): EditableCanvas {
  return inject(EDITABLE_CANVAS_KEY, { layerFor: () => null, slideId: computed(() => null) })
}
