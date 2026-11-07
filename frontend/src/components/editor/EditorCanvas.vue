<script setup lang="ts">
import { useEditorFetchGate } from '@/composables/useEditorFetchGate'
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { usePresentation } from '@/api/presentations'
import type { Slide } from '@/api/types'
import SlideView from '@/render/SlideView.vue'
import { useEditorStore } from '@/stores/editor'
import FloatingToolbar from './FloatingToolbar.vue'

const props = defineProps<{ presentationId: string; slide: Slide | null }>()

const editor = useEditorStore()
const { data: presentation } = usePresentation(toRef(props, 'presentationId'), useEditorFetchGate())

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
    aria-label="Slide canvas"
    class="dotted-canvas relative flex min-h-0 flex-1 flex-col rounded-t-panel px-2 pt-[62px] pb-2.5 max-[760px]:pt-[58px] max-[760px]:pb-2 max-[450px]:pt-14"
  >
    <div class="absolute top-2.5 left-1/2 z-30 -translate-x-1/2 max-[760px]:top-2 max-[450px]:top-[7px]"><FloatingToolbar /></div>
    <div
      class="flex min-h-0 w-full flex-1 [container-type:size] rounded-[11px]"
      :class="editor.zoom > 1 ? 'overflow-auto' : 'overflow-visible'"
    >
      <!-- margin:auto centres safely: a zoomed-in slide scrolls instead of clipping its left edge -->
      <div v-if="slide" class="relative m-auto shrink-0" :class="zooming && 'zoom-easing'" :style="{ width: slideWidth }">
        <Transition name="slide-change" mode="out-in">
          <!-- the key remounts SlideView per slide, so `rendered` fires for every switch -->
          <SlideView
            :key="slide.id ?? slide.index"
            :slide="slide"
            :theme="presentation?.theme"
            :fonts="presentation?.fonts"
            class="isolate overflow-hidden rounded-[10px] shadow-[0_18px_38px_#0004] max-[450px]:rounded-[7px]"
          />
        </Transition>
      </div>
      <p v-else class="m-auto text-[12px] text-muted">No slides yet.</p>
    </div>
    <slot name="status" />
  </section>
</template>
