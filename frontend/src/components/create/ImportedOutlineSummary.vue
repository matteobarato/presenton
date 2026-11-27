<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Info } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { Button } from '@/components/ui/button'
import WizardStepFooter from '@/components/create/wizard/WizardStepFooter.vue'
import SlideView from '@/render/SlideView.vue'

/**
 * Step 3 of a deck read from a PowerPoint, in place of the AI outline: its slides, in order, read-only. Nothing here
 * streams or generates: rebuilding the deck from a template would lose the PowerPoint's design.
 */
const props = defineProps<{ presentation: Presentation }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const count = computed(() => props.presentation.slides.length)

/** Like the wizard's own Next; the stream flag is dropped since nothing is generating (see `PreviewStep.go`). */
function next() {
  const query = { ...route.query }
  delete query.stream
  void router.push({ name: 'create', params: { id: props.presentation.id, step: 'preview' }, query })
}
</script>

<template>
  <div class="flex flex-col gap-4" data-testid="imported-outline">
    <h2 class="text-[15px] font-semibold text-tx-eef6fa">{{ t('create.wizard.imported.outlineHeading', { count }, count) }}</h2>
    <ol class="grid list-none grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 max-[520px]:grid-cols-2 max-[520px]:gap-2.5">
      <li v-for="(slide, i) in presentation.slides" :key="slide.id ?? `slide-${i}`" class="flex min-w-0 flex-col gap-1.5">
        <div
          class="overflow-hidden rounded-[8px] border border-ov/[0.07] bg-sx-101416"
          role="img"
          :aria-label="t('create.wizard.imported.slideAlt', { n: i + 1 })"
        >
          <SlideView
            :slide="slide"
            :theme="presentation.theme"
            :fonts="presentation.fonts"
            fit="width"
            lazy
            class="pointer-events-none overflow-hidden"
          />
        </div>
        <span class="px-0.5 text-[12px] text-tx-899296 tabular-nums" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>
      </li>
    </ol>
    <p class="flex items-start gap-1.5 text-[12px] leading-[1.6] text-tx-a9b8c0" data-testid="imported-outline-note">
      <Info class="mt-0.5 size-3.5 flex-none" aria-hidden="true" />{{ t('create.wizard.imported.outlineNote') }}
    </p>
  </div>

  <WizardStepFooter>
    <template #primary>
      <Button type="button" data-testid="imported-outline-next" @click="next">
        {{ t('create.wizard.next', { step: t('create.steps.preview') }) }}<ArrowRight class="size-4" aria-hidden="true" />
      </Button>
    </template>
  </WizardStepFooter>
</template>
