import { computed } from 'vue'
import { useSelectedElement } from '@/slide-editor/useSelectedElement'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

export type ImageFit = 'cover' | 'contain' | 'fill'

const clamp = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 50)

/** Image state and edits shared by the Image inspector section and the floating bar's quick controls. */
export function useImageControls() {
  const ctx = useSlideEditingContext()
  const { element, patch: patchElement } = useSelectedElement(ctx)

  // As the renderer reads it: cover, fill, else contain. A fill image has neither button pressed.
  const fit = computed<ImageFit>(() => {
    const raw = element.value?.fit
    return raw === 'cover' || raw === 'fill' ? raw : 'contain'
  })
  // An icon renders as a colour mask of its picture: a photo would show as a silhouette.
  const isIcon = computed(() => !!(element.value?.isIcon ?? element.value?.is_icon))
  const focusX = computed(() => clamp(element.value?.focus_x))
  const focusY = computed(() => clamp(element.value?.focus_y))

  function patch(label: string, change: Record<string, unknown>) {
    patchElement(label, (el) => ({ ...el, ...change }))
  }
  function replaceImage(src: string) {
    // A new picture starts centred and uncropped, as in the old editor.
    patch('Replace image', { data: src, focus_x: 50, focus_y: 50, crop_scale: null })
  }
  function setFit(value: 'cover' | 'contain') {
    if (value !== fit.value) patch('Image fit', { fit: value })
  }
  function setFocus(x: number, y: number) {
    patch('Crop focus', { focus_x: x, focus_y: y })
  }

  return { element, fit, isIcon, focusX, focusY, replaceImage, setFit, setFocus }
}
