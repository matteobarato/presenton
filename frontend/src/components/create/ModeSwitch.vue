<script setup lang="ts">
import type { CreateMode } from './options'

defineProps<{ modes: CreateMode[]; disabled?: boolean }>()
const model = defineModel<CreateMode>({ required: true })

const LABELS: Record<CreateMode, string> = { template: 'Template', smart: 'Smart' }
const HINTS: Record<CreateMode, string> = {
  template: 'Review an outline, then pick a template',
  smart: 'Designs every slide for you, streamed live',
}
</script>

<template>
  <div v-if="modes.length > 1" role="radiogroup" aria-label="Generation mode" class="inline-flex gap-1 rounded-button bg-field p-1">
    <button
      v-for="m in modes"
      :key="m"
      type="button"
      role="radio"
      :aria-checked="model === m"
      :title="HINTS[m]"
      :disabled="disabled"
      class="rounded-[6px] px-3 py-1.5 text-[12px] transition-colors duration-200 disabled:opacity-40"
      :class="model === m ? 'bg-accent text-accent-ink' : 'text-muted hover:text-text'"
      @click="model = m"
    >
      {{ LABELS[m] }}
    </button>
  </div>
</template>
