<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { AlertTriangle, Library, Pencil, Play } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { Button } from '@/components/ui/button'
import ExportOptions from '@/components/editor/export/ExportOptions.vue'
import WizardStepFooter from '@/components/create/wizard/WizardStepFooter.vue'
import type { DeckProgress } from '@/components/create/wizard/progress'

/**
 * Step 6: the export card on the page. Its own button is the action, so the footer only goes Back. Export is
 * never blocked by missing narration or presenter videos: it says what is missing and links back to Narration.
 */
const props = defineProps<{ presentation: Presentation; progress: DeckProgress }>()

const route = useRoute()
const id = computed(() => props.presentation.id)
const heading = computed(() => {
  const n = props.presentation.slides.length
  return `${props.presentation.title?.trim() || 'Presentation'} · ${n} ${n === 1 ? 'slide' : 'slides'}`
})

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
/** e.g. "1 presenter slide has no video · 1 slide has no narration"; empty when nothing is missing. */
const gaps = computed(() => {
  const { presenterVideos, narration } = props.progress.missing
  return [
    presenterVideos > 0 && `${plural(presenterVideos, 'presenter slide has', 'presenter slides have')} no video`,
    narration > 0 && `${plural(narration, 'slide has', 'slides have')} no narration`,
  ]
    .filter(Boolean)
    .join(' · ')
})
const videoNote = computed(() =>
  gaps.value ? `The narrated video is best with narration and presenter videos in place (${gaps.value}).` : undefined,
)
/** The Narration step, keeping the rest of the query (template). */
const narrationTo = computed(() => {
  const query = { ...route.query }
  delete query.stream
  return { name: 'create', params: { id: id.value, step: 'avatar' }, query }
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <p class="min-w-0 truncate text-[13px] font-medium text-[#d4dee3]" data-testid="export-heading">{{ heading }}</p>
    <p
      v-if="gaps"
      role="status"
      data-testid="export-gaps"
      class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border border-[#e8c9a233] bg-[#e8c9a210] px-3.5 py-2.5 text-[12px] text-[#e9d6bb]"
    >
      <AlertTriangle class="size-4 flex-none" aria-hidden="true" />
      <span>{{ gaps }}.</span>
      <RouterLink :to="narrationTo" data-testid="export-gaps-link" class="underline decoration-[#e9d6bb66] underline-offset-[3px] hover:text-white max-[559px]:inline-flex max-[559px]:min-h-11 max-[559px]:items-center">Go to Narration</RouterLink>
      <span class="text-[#c9b99f]">You can still export now.</span>
    </p>
    <section class="rounded-card border border-white/[0.06] bg-white/[0.015] p-4">
      <ExportOptions :presentation-id="id" :presentation="presentation" :video-note="videoNote" />
    </section>
    <!-- Where to go next: reachable, but quieter than the export card. -->
    <nav aria-label="After exporting" class="flex flex-wrap items-center gap-x-1 gap-y-1 text-[12px]" data-testid="export-links">
      <Button as-child variant="ghost" size="sm" class="max-[559px]:h-11">
        <RouterLink :to="{ name: 'present', params: { id } }"><Play class="size-4" aria-hidden="true" />Present</RouterLink>
      </Button>
      <Button as-child variant="ghost" size="sm" class="max-[559px]:h-11">
        <RouterLink :to="{ name: 'editor', params: { id } }"><Pencil class="size-4" aria-hidden="true" />Open in editor</RouterLink>
      </Button>
      <Button as-child variant="ghost" size="sm" class="max-[559px]:h-11">
        <RouterLink :to="{ name: 'library' }"><Library class="size-4" aria-hidden="true" />Back to library</RouterLink>
      </Button>
    </nav>
  </div>

  <WizardStepFooter />
</template>
