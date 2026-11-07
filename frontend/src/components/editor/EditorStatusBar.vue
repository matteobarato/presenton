<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Maximize2, Minus, Plus } from 'lucide-vue-next'
import { useEditorStore, ZOOM_MAX, ZOOM_MIN } from '@/stores/editor'

const props = defineProps<{ position: number; total: number; label?: string }>()
const editor = useEditorStore()
const route = useRoute()
const id = computed(() => String(route.params.id ?? ''))
const number = computed(() => String(props.position).padStart(2, '0'))

const btn =
  'grid h-6 w-[23px] place-items-center rounded-control text-muted hover:bg-white/[0.04] hover:text-white disabled:opacity-35 disabled:hover:bg-transparent'
</script>

<template>
  <div class="mt-2.5 flex min-h-[26px] flex-none items-center justify-between gap-2 px-1 text-[10px] text-[#99a6ac] max-[760px]:px-0.5 max-[450px]:mt-2">
    <div class="flex min-w-0 items-center gap-2 text-[#b2bfc7] max-[760px]:gap-[5px]">
      <span class="sr-only" aria-live="polite" data-testid="slide-position">Slide {{ position }} of {{ total }}</span>
      <span class="flex-none rounded-[4px] border border-white/[0.08] px-[5px] py-[3px] text-[9px] leading-none text-[#c6d2d8] tabular-nums" aria-hidden="true">
        {{ number }}
      </span>
      <span v-if="label" class="truncate max-[450px]:hidden" aria-hidden="true">{{ label }}</span>
      <span class="ml-[5px] text-[9px] whitespace-nowrap text-[#8f9fa9] max-[760px]:hidden">16:9</span>
    </div>
    <div class="flex items-center gap-px" role="group" aria-label="Zoom">
      <button type="button" :class="btn" :disabled="editor.zoom <= ZOOM_MIN" aria-label="Zoom out" @click="editor.setZoom(editor.zoom - 0.1)">
        <Minus class="size-[13px]" aria-hidden="true" />
      </button>
      <button type="button" class="min-w-9 p-[3px] text-[10px] text-[#b3bfc6] tabular-nums hover:text-white" title="Fit to canvas" @click="editor.setZoom(1)">
        {{ Math.round(editor.zoom * 100) }}%
      </button>
      <button type="button" :class="btn" :disabled="editor.zoom >= ZOOM_MAX" aria-label="Zoom in" @click="editor.setZoom(editor.zoom + 0.1)">
        <Plus class="size-[13px]" aria-hidden="true" />
      </button>
      <span class="mx-[7px] h-3 w-px bg-white/[0.06]" aria-hidden="true" />
      <RouterLink
        :to="{ name: 'present', params: { id }, query: position > 1 ? { from: String(position - 1) } : {} }"
        :class="btn"
        aria-label="Present from this slide"
        title="Present from this slide"
      >
        <Maximize2 class="size-[13px]" aria-hidden="true" />
      </RouterLink>
    </div>
  </div>
</template>
