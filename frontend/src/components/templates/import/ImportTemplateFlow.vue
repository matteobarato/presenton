<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'
import { importTasksKey } from '@/api/templateImport'
import { templatesKey } from '@/api/templates'
import { useTemplateImport } from '@/composables/useTemplateImport'
import AiProgress from '@/components/shell/AiProgress.vue'
import { toast } from '@/components/ui/sonner'
import ImportDropzone from './ImportDropzone.vue'
import ImportFontsStep from './ImportFontsStep.vue'
import ImportProgressStep from './ImportProgressStep.vue'
import ImportReviewStep from './ImportReviewStep.vue'

/**
 * PowerPoint → custom template, shown in the Templates page's import dialog. It mounts each time the
 * dialog opens; the heavy work runs as a server task, so the dialog can be closed and the import reopened.
 */
const props = defineProps<{ taskId?: string | null }>()
const emit = defineEmits<{ restart: [] }>()
const { t } = useI18n()
const router = useRouter()
const queryClient = useQueryClient()

const imp = useTemplateImport({
  initialTaskId: props.taskId ?? null,
  onDone: (id) => {
    void queryClient.invalidateQueries({ queryKey: templatesKey })
    void queryClient.invalidateQueries({ queryKey: importTasksKey })
    toast.success(t('templates.import.done'))
    void router.replace(`/templates/${encodeURIComponent(id)}`)
  },
})
const { step, missingFonts, replacements, name, description, error, busy, progress, slideImages, displayError } = imp

// The Templates page lists running imports; make sure it sees one that just started or restarted here.
watch(step, (now) => {
  if (now === 'generating') void queryClient.invalidateQueries({ queryKey: importTasksKey })
})

const fontError = ref<string | null>(null)
function replaceFont(fontName: string, file: File | null) {
  fontError.value = imp.setReplacement(fontName, file)
}

function startOver() {
  fontError.value = null
  imp.reset()
  emit('restart')
}
</script>

<template>
  <div v-if="step === 'upload'" class="anim-rise-in">
    <ImportDropzone :error="error" @select="imp.selectFile" />
  </div>

  <div v-else-if="step === 'preparing'" class="anim-rise-in" aria-busy="true">
    <AiProgress
      :stage="t('templates.import.preparing.stage')"
      :detail="t('templates.import.preparing.detail')"
      :label="t('templates.import.preparing.label')"
      :expected-ms="15_000"
    />
  </div>

  <ImportFontsStep
    v-else-if="step === 'fonts'"
    :fonts="missingFonts"
    :replacements="replacements"
    :busy="busy"
    :error="fontError ?? error"
    @replace="replaceFont"
    @continue="imp.continueFromFonts"
    @back="startOver"
  />

  <ImportReviewStep
    v-else-if="step === 'review'"
    v-model:name="name"
    v-model:description="description"
    :slides="slideImages"
    :busy="busy"
    :error="error"
    @create="imp.create"
    @back="startOver"
  />

  <ImportProgressStep
    v-else-if="step === 'generating' || step === 'error'"
    :progress="progress"
    :slides="slideImages"
    :status="step"
    :error="displayError"
    :busy="busy"
    @retry="imp.retry"
    @reset="startOver"
  />
</template>
