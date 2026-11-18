import { computed } from 'vue'
import { absoluteBoxForSelection } from '@/slide-editor/model'
import { radiusChanges } from '@/slide-editor/layoutOps'
import { useSelectedElement } from '@/slide-editor/useSelectedElement'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

export type ImageFit = 'cover' | 'contain' | 'fill'

const clamp = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 50)

/** Image state and edits shared by the Image inspector section and the floating bar's quick controls. */
export function useImageControls() {
  const ctx = useSlideEditingContext()
  const { element, target, patch: patchElement } = useSelectedElement(ctx)

  // Corner radius as {tl,tr,br,bl}; capped at half the shorter side (a full radius is a circle or pill).
  const radius = computed(() => {
    const r = element.value?.border_radius
    if (typeof r === 'number') return r
    const tl = (r as { tl?: unknown } | null | undefined)?.tl
    return typeof tl === 'number' ? tl : 0
  })
  const maxRadius = computed(() => {
    const box = ctx.ui.value && target.value ? absoluteBoxForSelection(ctx.ui.value, target.value) : null
    return box ? Math.max(0, Math.min(box.width, box.height) / 2) : 512
  })

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

  function setRadius(value: number) {
    patch('Corner radius', radiusChanges(value, maxRadius.value))
  }

  return { element, radius, maxRadius, setRadius, fit, isIcon, focusX, focusY, replaceImage, setFit, setFocus }
}
