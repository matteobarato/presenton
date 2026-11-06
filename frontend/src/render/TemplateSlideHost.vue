<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  localFontOptionsFromUnknown,
  renderLocalFontFaceCss,
} from '@/render/legacy/components/slide-editor/text/local-fonts'
import {
  TEMPLATE_V2_HTML_HEIGHT,
  TEMPLATE_V2_HTML_WIDTH,
  templateV2UiHasChart,
  templateV2UiToHtmlFragment,
} from '@/render/legacy/lib/template-v2-json-to-html'
import { hydrateTemplateCharts } from '@/render/template-charts'
import { cssVarDeclarations, themeCssVars, themeFontFaceCss } from '@/render/theme'

const props = withDefaults(
  defineProps<{ ui: unknown; theme?: unknown; fonts?: unknown; annotate?: boolean }>(),
  { theme: undefined, fonts: undefined, annotate: false },
)
const emit = defineEmits<{ rendered: []; error: [message: string] }>()

const host = ref<HTMLElement | null>(null)
let shadow: ShadowRoot | null = null
let disposeCharts: (() => void) | null = null

// @font-face rules are ignored inside shadow roots by some engines, so the
// faces are also registered once on the document.
const registeredFontCss = new Set<string>()
function registerDocumentFonts(css: string) {
  if (!css || registeredFontCss.has(css) || typeof document === 'undefined') return
  registeredFontCss.add(css)
  const style = document.createElement('style')
  style.dataset.slideFontFaces = 'true'
  style.textContent = css
  document.head.appendChild(style)
}

function fail(error: unknown) {
  emit('error', error instanceof Error ? error.message : String(error))
}

function render() {
  const el = host.value
  if (!el) return
  disposeCharts?.()
  disposeCharts = null
  try {
    shadow ??= el.shadowRoot ?? el.attachShadow({ mode: 'open' })
    const fragment = templateV2UiToHtmlFragment(props.ui, {
      fonts: props.fonts,
      annotateElements: props.annotate,
    })
    if (fragment == null) throw new Error('Slide has no renderable content')

    const fontCss =
      localFontOptionsFromUnknown(props.fonts).map(renderLocalFontFaceCss).join('') + themeFontFaceCss(props.theme)
    registerDocumentFonts(fontCss)

    const vars = cssVarDeclarations(themeCssVars(props.theme))
    shadow.innerHTML =
      `<style>${fontCss.replaceAll('</style', '<\\/style')}` +
      `:host{display:block;width:${TEMPLATE_V2_HTML_WIDTH}px;height:${TEMPLATE_V2_HTML_HEIGHT}px;overflow:hidden;${vars}}</style>` +
      fragment

    if (templateV2UiHasChart(props.ui)) {
      const charts = hydrateTemplateCharts(shadow)
      disposeCharts = charts.dispose
      charts.done.then(() => emit('rendered'), fail)
    } else {
      emit('rendered')
    }
  } catch (error) {
    fail(error)
  }
}

onMounted(render)
watch(() => [props.ui, props.theme, props.fonts, props.annotate], render)
onBeforeUnmount(() => disposeCharts?.())
</script>

<template>
  <div ref="host" data-template-host />
</template>
