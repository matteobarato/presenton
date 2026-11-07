<script setup lang="ts">
import { computed, reactive, ref, type Component } from 'vue'
import { FileText, Film, Presentation as PresentationIcon } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import FileExportCard from './FileExportCard.vue'
import VideoExportCard from './VideoExportCard.vue'

defineProps<{ presentationId: string; presentation: Presentation }>()

type Format = 'pptx' | 'pdf' | 'mp4'
const formats: { id: Format; name: string; detail: string; icon: Component }[] = [
  { id: 'pptx', name: 'PowerPoint', detail: 'Editable .pptx deck', icon: PresentationIcon },
  { id: 'pdf', name: 'PDF', detail: 'Ready to print or share', icon: FileText },
  { id: 'mp4', name: 'Video', detail: 'Narrated MP4', icon: Film },
]
const format = ref<Format>('pptx')

const running = reactive({ pptx: false, pdf: false })
const anyRunning = computed(() => running.pptx || running.pdf)
</script>

<template>
  <div class="flex flex-col" data-testid="export-options">
    <div role="radiogroup" aria-label="Export format" class="grid grid-cols-3 gap-2.5 max-[520px]:grid-cols-1">
      <button
        v-for="f in formats"
        :key="f.id"
        type="button"
        role="radio"
        :aria-checked="format === f.id"
        :data-testid="`format-${f.id}`"
        class="flex items-center gap-3 rounded-card border px-3.5 py-3 text-left transition-[background,border-color] duration-200 max-[520px]:py-2.5"
        :class="
          format === f.id
            ? 'border-[#a4d2e77a] bg-[#303c42] text-[#e4f2f9]'
            : 'border-white/[0.05] bg-[#272d30] text-[#c0cdd5] hover:bg-[#2e373b]'
        "
        @click="format = f.id"
      >
        <span
          class="grid size-9 flex-none place-items-center rounded-[10px]"
          :class="format === f.id ? 'bg-[#badbef1f] text-[#c4e4f4]' : 'bg-white/[0.04] text-[#9fb2bd]'"
          aria-hidden="true"
        >
          <component :is="f.icon" class="size-[18px]" />
        </span>
        <span class="min-w-0">
          <span class="block text-[12px] font-medium">{{ f.name }}</span>
          <span class="mt-0.5 block truncate text-[10px] text-[#97acb8]">{{ f.detail }}</span>
        </span>
      </button>
    </div>

    <!-- v-show keeps every format mounted, so a running export survives switching tabs. -->
    <div class="mt-6 border-t border-[#a7cbe012] pt-6">
      <div v-show="format === 'pptx'">
        <FileExportCard :presentation-id="presentationId" format="pptx" :busy="anyRunning" @running="running.pptx = $event" />
      </div>
      <div v-show="format === 'pdf'">
        <FileExportCard :presentation-id="presentationId" format="pdf" :busy="anyRunning" @running="running.pdf = $event" />
      </div>
      <div v-show="format === 'mp4'">
        <VideoExportCard :presentation-id="presentationId" :presentation="presentation" />
      </div>
    </div>
  </div>
</template>
