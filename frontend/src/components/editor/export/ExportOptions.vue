<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, reactive, ref, type Component } from 'vue'
import { FileText, Film, Presentation as PresentationIcon } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import FileExportCard from './FileExportCard.vue'
import VideoExportCard from './VideoExportCard.vue'

/** `videoNote` is a hint shown above the video export's options (the wizard says what narration is still missing). */
defineProps<{ presentationId: string; presentation: Presentation; videoNote?: string }>()

type Format = 'pptx' | 'pdf' | 'mp4'
const formats: { id: Format; icon: Component }[] = [
  { id: 'pptx', icon: PresentationIcon },
  { id: 'pdf', icon: FileText },
  { id: 'mp4', icon: Film },
]
const format = ref<Format>('pptx')

const running = reactive({ pptx: false, pdf: false })
const anyRunning = computed(() => running.pptx || running.pdf)
const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col" data-testid="export-options">
    <div role="radiogroup" :aria-label="t('editor.export.format')" class="grid grid-cols-3 gap-2.5 max-[520px]:grid-cols-1">
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
            ? 'border-lx-a4d2e77a bg-sx-303c42 text-tx-e4f2f9'
            : 'border-ov/[0.05] bg-field text-tx-c0cdd5 hover:bg-sx-2e373b'
        "
        @click="format = f.id"
      >
        <span
          class="grid size-9 flex-none place-items-center rounded-[10px]"
          :class="format === f.id ? 'bg-sx-badbef1f text-tx-c4e4f4' : 'bg-ov/[0.04] text-tx-9fb2bd'"
          aria-hidden="true"
        >
          <component :is="f.icon" class="size-[18px]" />
        </span>
        <span class="min-w-0">
          <span class="block text-[13px] font-medium">{{ t(`editor.export.formats.${f.id}.name`) }}</span>
          <span class="mt-0.5 block truncate text-[12px] text-tx-97acb8">{{ t(`editor.export.formats.${f.id}.detail`) }}</span>
        </span>
      </button>
    </div>

    <!-- v-show keeps every format mounted, so a running export survives switching tabs. -->
    <div class="mt-6 border-t border-lx-a7cbe012 pt-6">
      <div v-show="format === 'pptx'">
        <FileExportCard :presentation-id="presentationId" format="pptx" :busy="anyRunning" @running="running.pptx = $event" />
      </div>
      <div v-show="format === 'pdf'">
        <FileExportCard :presentation-id="presentationId" format="pdf" :busy="anyRunning" @running="running.pdf = $event" />
      </div>
      <div v-show="format === 'mp4'">
        <p v-if="videoNote" class="mb-3 text-[12px] leading-[1.6] text-tx-a9c4d2" data-testid="mp4-note">{{ videoNote }}</p>
        <VideoExportCard :presentation-id="presentationId" :presentation="presentation" />
      </div>
    </div>
  </div>
</template>
