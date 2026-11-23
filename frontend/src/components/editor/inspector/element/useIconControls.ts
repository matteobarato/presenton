import { computed, ref, type MaybeRefOrGetter, toValue } from 'vue'
import type { Presentation } from '@/api/types'
import { ICON_WEIGHTS } from '@/api/icons'
import { toast } from '@/components/ui/sonner'
import { i18n } from '@/i18n'
import { resolveAssetUrl } from '@/render/legacy/lib/template-v2-json-to-html'
import { setIcon, setIconColor, type IconWeight } from '@/slide-editor/elementStyle'
import { getElementAtSelection, type ElementSelection } from '@/slide-editor/model'
import { themePalette } from '@/slide-editor/themePalette'
import { useSelectedElement } from '@/slide-editor/useSelectedElement'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

/**
 * Icon state and edits shared by the Icon inspector section and the floating bar's quick controls.
 * The colour popover and the picker dialog each hold the target they opened for, so a commit lands there
 * even if the selection moves meanwhile.
 */
export function useIconControls(presentation: MaybeRefOrGetter<Presentation>) {
  const ctx = useSlideEditingContext()
  const { element, patch, capture } = useSelectedElement(ctx)
  const palette = computed(() => themePalette(toValue(presentation)))

  const src = computed(() => {
    const data = element.value?.data
    return typeof data === 'string' && data ? resolveAssetUrl(data) : null
  })
  const color = computed(() => (typeof element.value?.color === 'string' ? element.value.color : null))
  const weight = computed<IconWeight>(() => {
    const w = element.value?.icon_type
    return ICON_WEIGHTS.includes(w as IconWeight) ? (w as IconWeight) : 'bold'
  })
  const currentUrl = computed(() => (typeof element.value?.data === 'string' ? element.value.data : null))

  // The target when the colour popover or picker opened.
  let anchor: ElementSelection | null = null
  const hold = () => (anchor = capture())
  // Consumed by the commit it was held for.
  function takeAnchor() {
    const held = anchor ?? undefined
    anchor = null
    return held
  }
  const pickerOpen = ref(false)
  function openPicker() {
    hold()
    pickerOpen.value = true
  }

  const setColor = (value: string | null) => value && patch('Icon colour', (el) => setIconColor(el, value), takeAnchor())

  function onPick(url: string, picked: IconWeight) {
    const at = takeAnchor() ?? capture()
    const ui = ctx.ui.value
    if (!at || !ui || !getElementAtSelection(ui, at)) {
      toast.error(i18n.global.t('editorInspector.element.icon.removed'))
      return
    }
    patch('Change icon', (el) => setIcon(el, url, picked), at)
  }

  return { element, palette, src, color, weight, currentUrl, hold, setColor, pickerOpen, openPicker, onPick }
}
