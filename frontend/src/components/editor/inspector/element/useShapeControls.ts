import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import type { Presentation } from '@/api/types'
import {
  DEFAULT_FILL,
  DEFAULT_STROKE,
  readMarkers,
  readShapeStyle,
  setCornerRadius,
  setCurve,
  setDash,
  setFill,
  setMarkers,
  setStroke,
  swapMarkers,
  type DashStyle,
  type VectorMarker,
} from '@/slide-editor/elementStyle'
import type { ElementSelection } from '@/slide-editor/model'
import { themePalette } from '@/slide-editor/themePalette'
import { useSelectedElement } from '@/slide-editor/useSelectedElement'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

/**
 * Shape and line styling shared by the Shape and Line inspector sections and the floating bar's quick controls.
 * `hold` captures the target when a colour popover opens or a number field takes focus; the next commit
 * (`at()`) lands there even if the selection moves before it fires.
 */
export function useShapeControls(presentation: MaybeRefOrGetter<Presentation>) {
  const { element, patch, capture } = useSelectedElement(useSlideEditingContext())
  const style = computed(() => (element.value ? readShapeStyle(element.value) : null))
  const markers = computed(() => (element.value ? readMarkers(element.value) : null))
  const palette = computed(() => themePalette(toValue(presentation)))

  let anchor: ElementSelection | null = null
  // Consumed by the commit it was held for; survives selection changes in between (blur commits arrive after the click).
  const hold = () => (anchor = capture())
  const at = () => {
    const held = anchor ?? undefined
    anchor = null
    return held
  }
  // Turning Fill/Stroke back on restores what the element had when it was turned off.
  const lastFill = new Map<string, { color: string; opacity: number }>()
  const lastStroke = new Map<string, { color: string; opacity: number; width: number }>()
  const keyOf = () => JSON.stringify(capture())

  function toggleFill(on: boolean) {
    const s = style.value
    if (!s) return
    if (!on) lastFill.set(keyOf(), s.fill)
    const restored = lastFill.get(keyOf()) ?? DEFAULT_FILL
    patch('Fill', (el) => setFill(el, on ? restored : null))
  }
  function toggleStroke(on: boolean) {
    const s = style.value
    if (!s) return
    if (!on) lastStroke.set(keyOf(), { color: s.stroke.color, opacity: s.stroke.opacity, width: s.stroke.width })
    const restored = lastStroke.get(keyOf()) ?? DEFAULT_STROKE
    patch('Stroke', (el) => setStroke(el, on ? restored : null))
  }

  const fillColor = (color: string | null) => color && patch('Fill', (el) => setFill(el, { ...readShapeStyle(el).fill, color }), at())
  const fillOpacity = (percent: number) => patch('Fill', (el) => setFill(el, { ...readShapeStyle(el).fill, opacity: percent / 100 }), at())
  const strokeColor = (color: string | null) => color && patch('Stroke', (el) => setStroke(el, { color }), at())
  const strokeWidth = (width: number) => patch('Stroke', (el) => setStroke(el, { width }), at())
  const strokeDash = (dash: string) => patch('Stroke', (el) => setDash(el, dash as DashStyle))
  const cornerRadius = (r: number) => patch('Corner radius', (el) => setCornerRadius(el, r), at())
  const curve = (mode: string) => patch('Curve', (el) => setCurve(el, mode as 'none' | 'smooth'))
  const setMarker = (side: 'start' | 'end', marker: VectorMarker) =>
    patch('Line ends', (el) => {
      const current = readMarkers(el)
      return side === 'start' ? setMarkers(el, marker, current.end) : setMarkers(el, current.start, marker)
    })
  const swap = () => patch('Line ends', swapMarkers)

  return {
    element,
    style,
    markers,
    palette,
    hold,
    toggleFill,
    toggleStroke,
    fillColor,
    fillOpacity,
    strokeColor,
    strokeWidth,
    strokeDash,
    cornerRadius,
    curve,
    setMarker,
    swap,
  }
}
