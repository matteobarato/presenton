<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'
import { Check, Download, Loader2 } from 'lucide-vue-next'
import { extractApiErrorMessage } from '@/api/errors'
import { exportPresentation } from '@/api/exports'
import { Button } from '@/components/ui/button'

const props = defineProps<{ presentationId: string; format: 'pptx' | 'pdf'; busy: boolean }>()
const emit = defineEmits<{ (e: 'running', value: boolean): void }>()
const { t } = useI18n()

const url = ref<string | null>(null)
const error = ref<string | null>(null)
const running = ref(false)

async function run() {
  running.value = true
  emit('running', true)
  error.value = null
  try {
    url.value = (await exportPresentation(props.presentationId, props.format)).path
  } catch (e) {
    url.value = null
    error.value = extractApiErrorMessage(e, t('editor.export.file.exportFailed'))
  } finally {
    running.value = false
    emit('running', false)
  }
}
</script>

<template>
  <div class="flex flex-col gap-4" :data-testid="`export-${format}`">
    <p class="text-[11px] leading-[1.7] text-tx-a2b7c5">{{ t(`editor.export.file.blurb.${format}`) }}</p>
    <Button class="h-[43px] w-full" :disabled="busy" :data-testid="`export-${format}-button`" @click="run">
      <Loader2 v-if="running" :size="15" class="animate-spin motion-reduce:animate-none" />
      <Download v-else :size="15" />
      {{ running ? t('editor.export.file.exporting', { format: format.toUpperCase() }) : t('editor.export.file.export', { format: format.toUpperCase() }) }}
    </Button>
    <div
      v-if="url"
      class="anim-fade-in flex items-center gap-3 rounded-[9px] bg-sx-3449554d px-[13px] py-3 text-[11px] text-tx-aec6d7"
    >
      <span class="grid size-5 flex-none place-items-center rounded-full bg-sx-bad4cd text-tx-2d5146" aria-hidden="true">
        <Check :size="12" :stroke-width="3" />
      </span>
      {{ t('editor.export.file.ready', { format: format.toUpperCase() }) }}
      <a
        :href="url"
        download
        class="ml-auto inline-flex items-center gap-1.5 font-semibold text-accent underline-offset-2 hover:underline"
        :data-testid="`download-${format}`"
      >
        <Download :size="13" /> {{ t('editor.export.file.download', { format: format.toUpperCase() }) }}
      </a>
    </div>
    <p v-if="error" role="alert" class="text-[11px] text-danger-text">{{ error }}</p>
  </div>
</template>
