<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TemplateSummary } from '@/api/templates'
import { layoutToSlide } from '@/components/templates/layoutSlide'
import { useTemplateLayouts } from '@/composables/useTemplateLayouts'
import SlideView from '@/render/SlideView.vue'

const PREVIEW_COUNT = 3
const PREVIEW_SCALE = 0.1

const props = defineProps<{ template: TemplateSummary; selected: boolean }>()
const emit = defineEmits<{ select: [] }>()

const { layouts, theme, fonts, pending } = useTemplateLayouts(() => props.template)
const previews = computed(() =>
  layouts.value.slice(0, PREVIEW_COUNT).map((layout, i) => layoutToSlide(props.template.id, layout, i)),
)

const el = ref<HTMLElement | null>(null)
watch(
  [() => props.selected, el],
  ([selected, node]) => {
    if (selected && node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' })
  },
  { immediate: true },
)
</script>

<template>
  <button
    ref="el"
    type="button"
    role="radio"
    :aria-checked="selected"
    :data-testid="`template-${template.id}`"
    class="flex flex-col gap-2.5 rounded-card border bg-white/[0.02] p-3 text-left transition-[border-color,background] duration-200 hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-accent"
    :class="selected ? 'border-accent bg-white/[0.05]' : 'border-white/[0.07]'"
    @click="emit('select')"
  >
    <span class="flex items-baseline justify-between gap-2">
      <span class="text-[13px] font-semibold text-[#f6f8f9]">{{ template.name }}</span>
      <span class="text-[11px] text-muted">{{ template.layouts.length }} layouts</span>
    </span>
    <span class="flex gap-1.5">
      <span
        v-for="pv in previews"
        :key="pv.id"
        class="overflow-hidden rounded border border-white/[0.07]"
        data-testid="template-preview"
      >
        <SlideView :slide="pv" :theme="theme" :fonts="fonts" :scale="PREVIEW_SCALE" lazy />
      </span>
      <span
        v-if="!previews.length"
        class="grid place-items-center rounded bg-white/[0.03] text-[11px] text-muted"
        :style="{
          width: `${1280 * PREVIEW_SCALE}px`,
          height: `${720 * PREVIEW_SCALE}px`,
        }"
      >
        {{ pending ? 'Loading…' : 'No preview' }}
      </span>
    </span>
  </button>
</template>
