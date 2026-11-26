<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ImportTemplateFlow from './ImportTemplateFlow.vue'

/**
 * The PowerPoint import, as a dialog over the Templates page. `taskId` adopts a running or failed import
 * (from its card in the grid); without one the flow resumes this tab's last import, or starts at the upload.
 */
const open = defineModel<boolean>('open', { required: true })
defineProps<{ taskId?: string | null }>()
const emit = defineEmits<{ restart: [] }>()
const { t } = useI18n()
</script>

<template>
  <Dialog v-model:open="open">
    <!-- A stray click outside must not throw away an upload in progress: close with Esc or the X. -->
    <DialogContent class="w-[min(960px,calc(100vw-32px))] max-[760px]:p-5" data-testid="import-dialog" @interact-outside.prevent>
      <div class="flex flex-col gap-6">
        <DialogHeader>
          <DialogTitle>{{ t('templates.import.heading') }}</DialogTitle>
          <DialogDescription>{{ t('templates.import.intro') }}</DialogDescription>
        </DialogHeader>
        <ImportTemplateFlow :task-id="taskId" @restart="emit('restart')" />
      </div>
    </DialogContent>
  </Dialog>
</template>
