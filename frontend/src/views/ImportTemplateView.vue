<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'
import { templatesKey } from '@/api/templates'
import { useTemplateImport } from '@/composables/useTemplateImport'
import PageHeader from '@/components/shell/PageHeader.vue'
import AiProgress from '@/components/shell/AiProgress.vue'
import ImportDropzone from '@/components/templates/import/ImportDropzone.vue'
import ImportFontsStep from '@/components/templates/import/ImportFontsStep.vue'
import ImportReviewStep from '@/components/templates/import/ImportReviewStep.vue'
import ImportProgressStep from '@/components/templates/import/ImportProgressStep.vue'
import { toast } from '@/components/ui/sonner'

/** PowerPoint → custom template. The heavy work runs as a server task, so this page can be left and reopened. */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()

const initialTaskId = typeof route.query.task === 'string' && route.query.task ? route.query.task : null
const imp = useTemplateImport({
  initialTaskId,
  onDone: (id) => {
    void queryClient.invalidateQueries({ queryKey: templatesKey })
    toast.success(t('templates.import.done'))
    void router.replace(`/templates/${encodeURIComponent(id)}`)
  },
})
const { step, missingFonts, replacements, name, description, error, busy, progress, slideImages, taskError } = imp

const fontError = ref<string | null>(null)
function replaceFont(fontName: string, file: File | null) {
  fontError.value = imp.setReplacement(fontName, file)
}

function startOver() {
  fontError.value = null
  imp.reset()
  if (route.query.task) void router.replace({ query: { ...route.query, task: undefined } })
}
</script>

<template>
  <PageHeader :title="t('templates.import.title')" :parent="{ label: t('views.templates.title'), to: '/templates' }" />

  <section class="workspace-card">
    <div class="anim-rise-in mb-[33px]">
      <h1 class="text-[34px] leading-[1.22] font-medium tracking-[-0.04em] text-tx-e4ecf0 max-[1050px]:text-[30px] max-[760px]:text-[27px] max-[450px]:text-[25px]">
        {{ t('templates.import.heading') }}
      </h1>
      <p class="mt-[13px] text-[12px] text-tx-9aabb4 max-[760px]:text-[11px] max-[760px]:leading-[1.7]">
        {{ t('templates.import.intro') }}
      </p>
    </div>

    <div v-if="step === 'upload'" class="anim-rise-in max-w-[720px]">
      <ImportDropzone :error="error" @select="imp.selectFile" />
    </div>

    <div v-else-if="step === 'preparing'" class="anim-rise-in max-w-[560px]" aria-busy="true">
      <AiProgress
        :stage="t('templates.import.preparing.stage')"
        :detail="t('templates.import.preparing.detail')"
        :label="t('templates.import.preparing.label')"
        :expected-ms="15_000"
      />
    </div>

    <ImportFontsStep
      v-else-if="step === 'fonts'"
      class="max-w-[720px]"
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
      :error="taskError ?? error"
      :busy="busy"
      @retry="imp.retry"
      @reset="startOver"
    />
  </section>
</template>
