<script setup lang="ts">
import { computed } from 'vue'
import type { TemplateSummary } from '@/api/templates'
import { layoutToSlide } from '@/components/templates/layoutSlide'
import { useTemplateLayouts } from '@/composables/useTemplateLayouts'
import { withSourceTheme } from '@/render/retint'
import SlideView from '@/render/SlideView.vue'

/** A template's main image (its first layout). `width` is the rendered slide width; the default fills a 160px card. */
const props = withDefaults(defineProps<{ template: TemplateSummary; width?: number; themeOverride?: unknown }>(), { width: 158, themeOverride: undefined })
const SCALE = computed(() => props.width / 1280)
const { layouts, theme, fonts, pending } = useTemplateLayouts(() => props.template)
const shownTheme = computed(() => (props.themeOverride ? withSourceTheme(props.themeOverride as object, theme.value) : theme.value))
const first = computed(() => (layouts.value[0] ? layoutToSlide(props.template.id, layouts.value[0], 0) : undefined))
</script>

<template>
  <span class="block overflow-hidden rounded border border-white/[0.07]" data-testid="template-main-image">
    <SlideView v-if="first" :slide="first" :theme="shownTheme" :fonts="fonts" show-placeholders :scale="SCALE" lazy />
    <span
      v-else
      class="grid place-items-center bg-white/[0.03] text-[10px] text-muted"
      :style="{ width: `${1280 * SCALE}px`, height: `${720 * SCALE}px` }"
    >
      {{ pending ? 'Loading…' : 'No preview' }}
    </span>
  </span>
</template>
