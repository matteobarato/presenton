<script setup lang="ts">
import type { Presentation } from '@/api/types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useEditorStore } from '@/stores/editor'
import ExportOptions from './export/ExportOptions.vue'

defineProps<{ presentation: Presentation }>()
const editor = useEditorStore()
</script>

<template>
  <Dialog v-model:open="editor.exportOpen">
    <DialogContent class="w-[min(640px,calc(100vw-32px))] max-[760px]:px-6 max-[760px]:py-7">
      <DialogHeader>
        <DialogTitle>Take your presentation with you.</DialogTitle>
        <DialogDescription>Download an editable deck or a PDF, or render a narrated video.</DialogDescription>
      </DialogHeader>
      <div class="mt-6">
        <ExportOptions :presentation-id="presentation.id" :presentation="presentation" />
      </div>
    </DialogContent>
  </Dialog>
</template>
