<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useEditorFetchGate } from '@/composables/useEditorFetchGate'
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { usePresentation } from '@/api/presentations'
import { useSlideVideo } from '@/api/videos'
import { injectDeckNarrationIfAny } from './inspector/narration/useDeckNarration'
import { otherAvatarLanguage } from './inspector/video/avatar-state'
import type { Slide } from '@/api/types'
import SlideView from '@/render/SlideView.vue'
import { slideKind } from '@/render/slide-kind'
import { useEditorStore } from '@/stores/editor'
import FloatingElementEditor from './canvas/floating/FloatingElementEditor.vue'
import EditableSlide from './canvas/EditableSlide.vue'
import SelectionAnnouncer from './canvas/SelectionAnnouncer.vue'

const props = defineProps<{ presentationId: string; slide: Slide | null }>()

const editor = useEditorStore()
const { t } = useI18n()
const scrollerEl = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const { data: presentation } = usePresentation(toRef(props, 'presentationId'), useEditorFetchGate())
// The slide's editing state is provided by EditorView, so the inspector shares it.
// The slide's avatar video shows in its placeholder on the canvas.
const { video, src: videoSrc } = useSlideVideo(() => props.presentationId, () => props.slide?.id)
// An avatar recorded for another narration language plays here but not in Present or the export: say so on it.
const narration = injectDeckNarrationIfAny()
const nameOf = (code: string) => narration?.languages.value?.find((l) => l.code === code)?.name ?? code
const languageBadge = computed(() => {
  const language = narration?.language.value ?? ''
  const code = otherAvatarLanguage(video.value, language)
  const box = video.value?.placeholder
  if (!code || !box) return null
  return {
    text: t('editor.canvas.avatarLanguage', { avatar: nameOf(code), language: nameOf(language) }),
    style: { left: `${(box.position.x / 1280) * 100}%`, top: `${(box.position.y / 720) * 100}%`, maxWidth: `${(box.size.width / 1280) * 100}%` },
  }
})
const smart = computed(() => !!props.slide && slideKind(props.slide) === 'smart')

// Ease zoom steps, but only around a zoom change: during panel animations the slide must
// track the stage frame by frame, which a running width transition would lag behind.
const zooming = ref(false)
let zoomTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => editor.zoom,
  () => {
    zooming.value = true
    clearTimeout(zoomTimer)
    zoomTimer = setTimeout(() => (zooming.value = false), 300)
  },
)
onBeforeUnmount(() => clearTimeout(zoomTimer))

// Aera fit: the slide fills the stage's width or height, whichever binds first, times the zoom.
const slideWidth = computed(() => {
  const z = editor.zoom
  return `min(calc(100cqw * ${z}), calc(100cqh * 16 / 9 * ${z}))`
})
</script>

<template>
  <section
    :aria-label="t('editor.canvas.slideCanvas')"
    class="dotted-canvas relative flex min-h-0 flex-1 flex-col rounded-t-panel p-2 pt-2.5 max-[760px]:pt-2"
  >
    <div
      ref="scrollerEl"
      class="flex min-h-0 w-full flex-1 [container-type:size] rounded-[11px]"
      :class="editor.zoom > 1 ? 'overflow-auto' : 'overflow-visible'"
    >
      <!-- margin:auto centres safely: a zoomed-in slide scrolls instead of clipping its left edge -->
      <div v-if="slide" ref="stageEl" class="relative m-auto shrink-0" :class="zooming && 'zoom-easing'" :style="{ width: slideWidth }">
        <Transition name="slide-change" mode="out-in">
          <!-- the key remounts the slide per switch, so `rendered` fires for every switch -->
          <EditableSlide
            v-if="!smart"
            :key="slide.id ?? slide.index"
            :slide="slide"
            :theme="presentation?.theme"
            :fonts="presentation?.fonts"
            :video-src="videoSrc"
            class="isolate rounded-[10px] shadow-[0_18px_38px_#0004] max-[450px]:rounded-[7px]"
          />
          <SlideView
            v-else
            :key="slide.id ?? slide.index"
            :slide="slide"
            :theme="presentation?.theme"
            :fonts="presentation?.fonts"
            class="isolate overflow-hidden rounded-[10px] shadow-[0_18px_38px_#0004] max-[450px]:rounded-[7px]"
          />
        </Transition>
        <span
          v-if="languageBadge"
          class="pointer-events-none absolute z-10 m-1.5 truncate rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-danger-text"
          :style="languageBadge.style"
          :title="t('editor.canvas.avatarLanguageTitle')"
          data-testid="avatar-language-badge"
        >{{ languageBadge.text }}</span>
      </div>
      <p v-else class="m-auto text-[12px] text-muted">{{ t('editor.canvas.noSlides') }}</p>
    </div>
    <slot name="status" />
    <FloatingElementEditor
      v-if="presentation"
      :stage="stageEl"
      :scroller="scrollerEl"
      :presentation="presentation"
      :presentation-id="presentationId"
      :slide="slide"
    />
    <SelectionAnnouncer />
  </section>
</template>
