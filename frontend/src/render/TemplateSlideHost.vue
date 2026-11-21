<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  localFontOptionsFromUnknown,
  renderLocalFontFaceCss,
} from '@/render/legacy/components/slide-editor/text/local-fonts'
import {
  TEMPLATE_V2_HTML_HEIGHT,
  TEMPLATE_V2_HTML_WIDTH,
  type TemplateV2ItemSource,
  templateV2ItemSources,
  templateV2UiHasChart,
  templateV2UiToHtmlFragment,
} from '@/render/legacy/lib/template-v2-json-to-html'
import { registerDocumentFonts } from '@/render/font-registry'
import { hydrateTemplateCharts } from '@/render/template-charts'
import { cssVarDeclarations, themeCssVars, themeFontFaceCss } from '@/render/theme'

const props = withDefaults(
  defineProps<{
    ui: unknown
    theme?: unknown
    fonts?: unknown
    annotate?: boolean
    showPlaceholders?: boolean
    /** The slide's avatar video: shown in the placeholder layer, in place of its picture. */
    videoSrc?: string | null
  }>(),
  { theme: undefined, fonts: undefined, annotate: false, showPlaceholders: false, videoSrc: null },
)
const emit = defineEmits<{ rendered: []; error: [message: string] }>()

const host = ref<HTMLElement | null>(null)
let shadow: ShadowRoot | null = null
let disposeCharts: (() => void) | null = null
let generation = 0
// The item sources of the ui last written to the shadow DOM, so layerFor matches the DOM.
let renderedSources: TemplateV2ItemSource[] = []

function backgroundOnly(ui: unknown): string {
  const raw = (ui as { background?: unknown } | null)?.background
  const color = typeof raw === 'string' && /^[#\w(),.%\s-]+$/.test(raw) ? raw : '#FFFFFF'
  return `<div style="width:${TEMPLATE_V2_HTML_WIDTH}px;height:${TEMPLATE_V2_HTML_HEIGHT}px;background:${color}"></div>`
}

// The placeholder's picture becomes a paused video at the same place, keeping its layer, so content
// above the avatar still covers it. The first frame shows (#t); it fills the box as the export does.
function mountVideo(root: ShadowRoot) {
  const src = props.videoSrc
  if (!src) {
    // No video yet: the poster is transparent, so mark the placeholder as an avatar slot while editing
    // or previewing a template. Exports and the present view never set either prop.
    if (props.annotate || props.showPlaceholders) {
      root.querySelectorAll<HTMLElement>('[data-video-placeholder]').forEach((node) => {
        node.style.background =
          "url('/presenter-silhouette.svg') center bottom / contain no-repeat, linear-gradient(160deg, #e6f3fa, #cfe6f2)"
        node.style.opacity = '0.6'
        node.style.outline = '2px dashed rgba(52, 110, 140, 0.5)'
        node.style.outlineOffset = '-2px'
        node.setAttribute('title', 'Avatar')
      })
    }
    return
  }
  root.querySelectorAll<HTMLElement>('[data-video-placeholder]').forEach((node) => {
    const img = node instanceof HTMLImageElement ? node : node.querySelector('img')
    if (!img) return
    const video = document.createElement('video')
    video.setAttribute('style', img.getAttribute('style') ?? '')
    video.style.objectFit = 'cover'
    video.style.objectPosition = 'center'
    video.style.transform = ''
    video.style.background = '#000'
    video.style.pointerEvents = 'none'
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    video.src = `${src}#t=0.1`
    video.dataset.slideVideo = 'true'
    if (img === node) video.dataset.videoPlaceholder = 'true'
    img.replaceWith(video)
  })
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
    const ui = props.ui
    const fragment = templateV2UiToHtmlFragment(ui, {
      fonts: props.fonts,
      annotateElements: props.annotate,
    })

    const fontCss =
      localFontOptionsFromUnknown(props.fonts).map(renderLocalFontFaceCss).join('') + themeFontFaceCss(props.theme)
    registerDocumentFonts(fontCss)

    renderedSources = props.annotate && fragment ? templateV2ItemSources(ui) : []
    const vars = cssVarDeclarations(themeCssVars(props.theme))
    shadow.innerHTML =
      `<style>${fontCss.replaceAll('</style', '<\\/style')}` +
      `:host{display:block;width:${TEMPLATE_V2_HTML_WIDTH}px;height:${TEMPLATE_V2_HTML_HEIGHT}px;overflow:hidden;${vars}}</style>` +
      (fragment ?? backgroundOnly(ui))
    mountVideo(shadow)

    if (templateV2UiHasChart(ui)) {
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

function layerFor(source: TemplateV2ItemSource): HTMLElement | null {
  if (!shadow) return null
  const index = renderedSources.findIndex(
    (candidate) => candidate.kind === source.kind && candidate.index === source.index,
  )
  if (index < 0) return null
  return shadow.querySelector<HTMLElement>(`[data-hf-el="e${index}"]`)
}

/** The rendered slide's shadow root (the motion preview animates inside it). */
function shadowRoot(): ShadowRoot | null {
  return shadow
}

defineExpose({ layerFor, shadowRoot })

onMounted(render)
watch(() => [props.ui, props.theme, props.fonts, props.annotate, props.showPlaceholders, props.videoSrc], render)
onBeforeUnmount(() => {
  generation++
  disposeCharts?.()
})
</script>

<template>
  <div ref="host" data-template-host />
</template>
