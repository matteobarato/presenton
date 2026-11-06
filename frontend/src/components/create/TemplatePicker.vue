<script setup lang="ts">
import { reactive, watch } from 'vue'
import { getTemplate, type TemplateDetail } from '@/api/outlines'
import type { TemplateSummary } from '@/api/templates'
import type { Slide } from '@/api/types'
import SlideView from '@/render/SlideView.vue'

const PREVIEW_COUNT = 3
const PREVIEW_SCALE = 0.1

const props = defineProps<{ templates: TemplateSummary[] }>()
const selected = defineModel<string | null>({ default: null })

// Custom templates list only a layout count; their layouts load lazily.
const details = reactive<Record<string, TemplateDetail | 'failed'>>({})
const requested = new Set<string>()

function hasRealLayouts(t: TemplateSummary): boolean {
  return t.layouts.some((l) => l && typeof l === 'object')
}

watch(
  () => props.templates,
  (templates) => {
    for (const t of templates) {
      if (hasRealLayouts(t) || t.layouts.length === 0 || requested.has(t.id)) continue
      requested.add(t.id)
      getTemplate(t.id).then(
        (d) => (details[t.id] = d),
        () => (details[t.id] = 'failed'),
      )
    }
  },
  { immediate: true },
)

interface Preview {
  slide: Slide
}

function previewsFor(t: TemplateSummary): {
  previews: Preview[]
  theme: unknown
  fonts: unknown
  pending: boolean
} {
  let layouts: unknown[] = t.layouts
  let theme = t.theme
  let fonts = t.fonts
  let pending = false
  if (!hasRealLayouts(t) && t.layouts.length > 0) {
    const d = details[t.id]
    if (d && d !== 'failed') {
      layouts = d.layouts
      theme = d.theme
      fonts = d.fonts
    } else {
      layouts = []
      pending = d === undefined
    }
  }
  const previews = layouts
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .slice(0, PREVIEW_COUNT)
    .map((layout, i) => ({
      slide: {
        id: `${t.id}-preview-${i}`,
        content: {},
        ui: layout,
        layout: typeof layout.id === 'string' ? layout.id : `slide-${i}`,
        layout_group: 'template-v2',
      } as unknown as Slide,
    }))
  return { previews, theme, fonts, pending }
}
</script>

<template>
  <div role="radiogroup" aria-label="Template" class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
    <button
      v-for="t in props.templates"
      :key="t.id"
      type="button"
      role="radio"
      :aria-checked="selected === t.id"
      :data-testid="`template-${t.id}`"
      class="flex flex-col gap-2.5 rounded-card border bg-white/[0.02] p-3 text-left transition-[border-color,background] duration-200 hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-accent"
      :class="selected === t.id ? 'border-accent bg-white/[0.05]' : 'border-white/[0.07]'"
      @click="selected = t.id"
    >
      <span class="flex items-baseline justify-between gap-2">
        <span class="text-[13px] font-semibold text-[#f6f8f9]">{{ t.name }}</span>
        <span class="text-[11px] text-muted">{{ t.layouts.length }} layouts</span>
      </span>
      <span class="flex gap-1.5">
        <span
          v-for="pv in previewsFor(t).previews"
          :key="pv.slide.id"
          class="overflow-hidden rounded border border-white/[0.07]"
          data-testid="template-preview"
        >
          <SlideView
            :slide="pv.slide"
            :theme="previewsFor(t).theme"
            :fonts="previewsFor(t).fonts"
            :scale="PREVIEW_SCALE"
            lazy
          />
        </span>
        <span
          v-if="!previewsFor(t).previews.length"
          class="grid place-items-center rounded bg-white/[0.03] text-[11px] text-muted"
          :style="{
            width: `${1280 * PREVIEW_SCALE}px`,
            height: `${720 * PREVIEW_SCALE}px`,
          }"
        >
          {{ previewsFor(t).pending ? 'Loading…' : 'No preview' }}
        </span>
      </span>
    </button>
  </div>
</template>
