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
import { registerDocumentFonts } from '@/render/font-registry'
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
let generation = 0

function backgroundOnly(ui: unknown): string {
  const raw = (ui as { background?: unknown } | null)?.background
  const color = typeof raw === 'string' && /^[#\w(),.%\s-]+$/.test(raw) ? raw : '#FFFFFF'
  return `<div style="width:${TEMPLATE_V2_HTML_WIDTH}px;height:${TEMPLATE_V2_HTML_HEIGHT}px;background:${color}"></div>`
}

function fail(error: unknown) {
  emit('error', error instanceof Error ? error.message : String(error))
}

function render() {
  const el = host.value
  if (!el) return
  disposeCharts?.()
  disposeCharts = null
  const current = ++generation
  try {
    shadow ??= el.shadowRoot ?? el.attachShadow({ mode: 'open' })
    const fragment = templateV2UiToHtmlFragment(props.ui, {
      fonts: props.fonts,
      annotateElements: props.annotate,
    })

    const fontCss =
      localFontOptionsFromUnknown(props.fonts).map(renderLocalFontFaceCss).join('') + themeFontFaceCss(props.theme)
    registerDocumentFonts(fontCss)

    const vars = cssVarDeclarations(themeCssVars(props.theme))
    shadow.innerHTML =
      `<style>${fontCss.replaceAll('</style', '<\\/style')}` +
      `:host{display:block;width:${TEMPLATE_V2_HTML_WIDTH}px;height:${TEMPLATE_V2_HTML_HEIGHT}px;overflow:hidden;${vars}}</style>` +
      (fragment ?? backgroundOnly(props.ui))

    if (templateV2UiHasChart(props.ui)) {
      const charts = hydrateTemplateCharts(shadow)
      disposeCharts = charts.dispose
      charts.done.then(
        () => {
          if (current === generation) emit('rendered')
        },
        (error) => {
          if (current === generation) fail(error)
        },
      )
    } else {
      emit('rendered')
    }
  } catch (error) {
    fail(error)
  }
}

onMounted(render)
watch(() => [props.ui, props.theme, props.fonts, props.annotate], render)
onBeforeUnmount(() => {
  generation++
  disposeCharts?.()
})
</script>

<template>
  <div ref="host" data-template-host />
</template>
