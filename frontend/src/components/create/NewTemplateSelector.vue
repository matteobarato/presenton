<script setup lang="ts">
import { LayoutTemplate } from 'lucide-vue-next'
import type { TemplateSummary } from '@/api/templates'
import TemplateCardThumb from './TemplateCardThumb.vue'

const props = defineProps<{ templates: TemplateSummary[]; disabled?: boolean }>()
const selected = defineModel<string | null>({ default: null })

function pick(id: string | null) {
  if (!props.disabled) selected.value = id
}
const cardClass =
  'flex w-[176px] shrink-0 flex-col gap-2 rounded-card border bg-white/[0.02] p-2 text-left transition-[border-color,background] duration-200 hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <span id="new-template-label" class="text-[11px] text-muted">Template (optional)</span>
    <div role="radiogroup" aria-labelledby="new-template-label" class="flex gap-2 overflow-x-auto pb-1">
      <button
        type="button"
        role="radio"
        :aria-checked="!templates.some((t) => t.id === selected)"
        :disabled="disabled"
        data-testid="new-template-none"
        :class="[cardClass, !templates.some((t) => t.id === selected) ? 'border-accent bg-white/[0.05]' : 'border-white/[0.07]']"
        @click="pick(null)"
      >
        <span class="grid aspect-video w-full place-items-center rounded border border-white/[0.07] bg-white/[0.03]">
          <LayoutTemplate class="size-5 text-[#9aabb4]" aria-hidden="true" />
        </span>
        <span class="truncate text-[11px] font-medium text-[#e4ecf0]">Decide later</span>
      </button>
      <button
        v-for="t in templates"
        :key="t.id"
        type="button"
        role="radio"
        :aria-checked="selected === t.id"
        :disabled="disabled"
        :data-testid="`new-template-${t.id}`"
        :class="[cardClass, selected === t.id ? 'border-accent bg-white/[0.05]' : 'border-white/[0.07]']"
        @click="pick(t.id)"
      >
        <TemplateCardThumb :template="t" />
        <span class="truncate text-[11px] font-medium text-[#e4ecf0]">{{ t.name }}</span>
      </button>
    </div>
  </div>
</template>
