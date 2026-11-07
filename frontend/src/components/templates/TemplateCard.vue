<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowUpRight } from 'lucide-vue-next'
import type { TemplateSummary } from '@/api/templates'
import { Skeleton } from '@/components/ui/skeleton'
import { useTemplateLayouts } from '@/composables/useTemplateLayouts'
import SlideView from '@/render/SlideView.vue'
import { layoutToSlide } from './layoutSlide'

const props = defineProps<{ template: TemplateSummary }>()

const { layouts, theme, fonts, pending } = useTemplateLayouts(() => props.template)
const cover = computed(() => {
  const first = layouts.value[0]
  return first ? layoutToSlide(props.template.id, first, 0) : null
})
const count = computed(() => props.template.layouts.length)
const meta = computed(
  () => `${count.value} ${count.value === 1 ? 'layout' : 'layouts'} · ${props.template.kind === 'custom' ? 'Custom' : 'Built-in'}`,
)
</script>

<template>
  <article data-testid="template-card" class="group min-w-0">
    <RouterLink
      :to="`/templates/${template.id}`"
      :aria-label="`View ${template.name}`"
      class="block rounded-card focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent"
    >
      <div class="aspect-video overflow-hidden rounded-card bg-[#101416] shadow-[0_6px_15px_#0002] transition-transform duration-200 motion-safe:group-hover:-translate-y-1">
        <Skeleton v-if="pending" data-testid="cover-skeleton" class="size-full rounded-none" />
        <SlideView v-else-if="cover" :slide="cover" :theme="theme" :fonts="fonts" fit="width" lazy />
        <div v-else class="size-full bg-[#1a2125]" />
      </div>
      <div class="mt-[13px] flex items-center justify-between gap-3">
        <div class="min-w-0">
          <h3 class="truncate text-[14px] font-medium text-[#dbe7ef]">{{ template.name }}</h3>
          <p class="mt-[7px] text-[10px] text-[#95aab7]">{{ meta }}</p>
        </div>
        <span
          class="flex flex-none items-center gap-2 text-[10px] text-[#a1bac9] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 max-[760px]:opacity-100"
        >
          View template <ArrowUpRight class="size-[15px]" aria-hidden="true" />
        </span>
      </div>
    </RouterLink>
  </article>
</template>
