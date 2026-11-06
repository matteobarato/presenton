<script setup lang="ts">
import { ref } from 'vue'
import { Download, Loader2 } from 'lucide-vue-next'
import { extractApiErrorMessage } from '@/api/errors'
import { exportPresentation } from '@/api/exports'
import { Button } from '@/components/ui/button'

const props = defineProps<{ presentationId: string; format: 'pptx' | 'pdf'; busy: boolean }>()
const emit = defineEmits<{ (e: 'running', value: boolean): void }>()

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
    error.value = extractApiErrorMessage(e, 'Export failed')
  } finally {
    running.value = false
    emit('running', false)
  }
}
</script>

<template>
  <div class="flex flex-col gap-2" :data-testid="`export-${format}`">
    <Button variant="secondary" :disabled="busy" :data-testid="`export-${format}-button`" @click="run">
      <Loader2 v-if="running" :size="14" class="animate-spin motion-reduce:animate-none" />
      {{ running ? `Exporting ${format.toUpperCase()}...` : `Export ${format.toUpperCase()}` }}
    </Button>
    <a
      v-if="url"
      :href="url"
      download
      class="inline-flex items-center gap-1.5 text-[12px] text-accent underline-offset-2 hover:underline"
      :data-testid="`download-${format}`"
    >
      <Download :size="13" /> Download {{ format.toUpperCase() }}
    </a>
    <p v-if="error" role="alert" class="text-[11px] text-danger-text">{{ error }}</p>
  </div>
</template>
