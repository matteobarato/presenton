<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Library, Pencil, Play } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { Button } from '@/components/ui/button'
import ExportOptions from '@/components/editor/export/ExportOptions.vue'
import WizardStepFooter from '@/components/create/wizard/WizardStepFooter.vue'

/** Step 7: the export card on the page. Its own button is the action, so the footer only goes Back. */
const props = defineProps<{ presentation: Presentation }>()

const id = computed(() => props.presentation.id)
const heading = computed(() => {
  const n = props.presentation.slides.length
  return `${props.presentation.title?.trim() || 'Presentation'} · ${n} ${n === 1 ? 'slide' : 'slides'}`
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-wrap items-center gap-2.5">
      <p class="min-w-0 flex-1 truncate text-[13px] font-medium text-[#d4dee3]" data-testid="export-heading">{{ heading }}</p>
      <Button as-child variant="ghost" size="sm">
        <RouterLink :to="{ name: 'present', params: { id } }"><Play class="size-4" aria-hidden="true" />Present</RouterLink>
      </Button>
      <Button as-child variant="ghost" size="sm">
        <RouterLink :to="{ name: 'editor', params: { id } }"><Pencil class="size-4" aria-hidden="true" />Open in editor</RouterLink>
      </Button>
      <Button as-child variant="ghost" size="sm">
        <RouterLink :to="{ name: 'library' }"><Library class="size-4" aria-hidden="true" />Back to library</RouterLink>
      </Button>
    </div>
    <section class="rounded-card border border-white/[0.06] bg-white/[0.015] p-4">
      <ExportOptions :presentation-id="id" :presentation="presentation" />
    </section>
  </div>

  <WizardStepFooter />
</template>
