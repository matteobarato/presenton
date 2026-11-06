<script setup lang="ts">
import { useEditorFetchGate } from '@/composables/useEditorFetchGate'
import { toRef } from 'vue'
import { usePresentation } from '@/api/presentations'
import type { Slide } from '@/api/types'
import SlideView from '@/render/SlideView.vue'
import { useEditorStore } from '@/stores/editor'
import AskOverlay from './AskOverlay.vue'
import FloatingToolbar from './FloatingToolbar.vue'

const props = defineProps<{ presentationId: string; slide: Slide | null }>()

const editor = useEditorStore()
const { data: presentation } = usePresentation(toRef(props, 'presentationId'), useEditorFetchGate())
</script>

<template>
  <section aria-label="Slide canvas" class="relative flex min-h-0 flex-1 overflow-hidden rounded-panel bg-canvas">
    <div class="absolute top-3 left-1/2 z-10 -translate-x-1/2"><FloatingToolbar /></div>
    <div class="flex min-h-0 min-w-0 flex-1 overflow-auto p-6 pt-16 max-[760px]:p-3 max-[760px]:pt-14">
      <!-- margin:auto centres safely: a zoomed-in slide scrolls instead of clipping its left edge -->
      <div v-if="slide" class="m-auto shrink-0" :style="{ width: `${editor.zoom * 100}%` }">
        <Transition name="slide-change" mode="out-in">
          <!-- the key remounts SlideView per slide, so `rendered` fires for every switch -->
          <SlideView
            :key="slide.id ?? slide.index"
            :slide="slide"
            :theme="presentation?.theme"
            :fonts="presentation?.fonts"
            class="rounded-card shadow-[0_12px_40px_#0006]"
          />
        </Transition>
      </div>
      <p v-else class="m-auto text-[13px] text-muted">No slides yet.</p>
    </div>
    <AskOverlay v-if="slide" v-model:open="editor.askOpen" :slide="slide" />
  </section>
</template>
