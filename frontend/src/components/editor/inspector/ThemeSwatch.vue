<script setup lang="ts">
import { computed } from 'vue'
import { Pencil, Trash2 } from 'lucide-vue-next'
import { DEFAULT_TEMPLATE_THEME, normalizeTemplateTheme } from '@/render/legacy/lib/template-theme'

const props = defineProps<{
  name: string
  /** A theme record, or null for the built-in default palette. */
  theme: unknown
  selected: boolean
  custom: boolean
}>()
defineEmits<{ select: []; edit: []; remove: [] }>()

const colors = computed(() => {
  const t = normalizeTemplateTheme(props.theme) ?? DEFAULT_TEMPLATE_THEME
  return [t.background, t.card, t.primary, t.background_text, t.graph_0, t.graph_4]
})
</script>

<template>
  <div class="group relative" data-testid="theme-item">
    <button
      type="button"
      :aria-pressed="selected"
      class="flex w-full flex-col gap-2 rounded-button border bg-field p-2 text-left transition-colors duration-200 hover:border-white/20 focus-visible:border-accent focus-visible:outline-none"
      :class="selected ? 'border-accent' : 'border-transparent'"
      @click="$emit('select')"
    >
      <span class="flex h-6 overflow-hidden rounded-[6px] border border-white/10" aria-hidden="true">
        <span v-for="(c, i) in colors" :key="i" class="flex-1" data-testid="swatch-chip" :style="{ backgroundColor: c }" />
      </span>
      <span class="truncate text-[12px] text-[#dce6ec]">{{ name }}</span>
    </button>
    <div
      v-if="custom"
      class="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100"
    >
      <button
        type="button"
        class="rounded-[6px] bg-black/60 p-1 text-white hover:bg-black/80"
        :aria-label="`Edit ${name}`"
        @click="$emit('edit')"
      >
        <Pencil class="size-3" />
      </button>
      <button
        type="button"
        class="rounded-[6px] bg-black/60 p-1 text-white hover:bg-black/80"
        :aria-label="`Delete ${name}`"
        @click="$emit('remove')"
      >
        <Trash2 class="size-3" />
      </button>
    </div>
  </div>
</template>
