<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { Presentation, Slide } from '@/api/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import FileExportCard from './export/FileExportCard.vue'
import VideoExportCard from './export/VideoExportCard.vue'

defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const running = reactive({ pptx: false, pdf: false })
const anyRunning = computed(() => running.pptx || running.pdf)
</script>

<template>
  <section class="flex flex-col gap-3" data-testid="export-tab">
    <Card>
      <CardHeader><CardTitle>Files</CardTitle></CardHeader>
      <CardContent class="flex flex-col gap-3">
        <FileExportCard :presentation-id="presentationId" format="pptx" :busy="anyRunning" @running="running.pptx = $event" />
        <FileExportCard :presentation-id="presentationId" format="pdf" :busy="anyRunning" @running="running.pdf = $event" />
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>Video (MP4)</CardTitle></CardHeader>
      <CardContent>
        <VideoExportCard :presentation-id="presentationId" :default-language="presentation.language" />
      </CardContent>
    </Card>
  </section>
</template>
