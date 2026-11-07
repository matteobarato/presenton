<script setup lang="ts">
import type { TemplateSummary } from '@/api/templates'
import TemplatePickerOption from './TemplatePickerOption.vue'

const props = defineProps<{ templates: TemplateSummary[] }>()
const selected = defineModel<string | null>({ default: null })
</script>

<template>
  <div role="radiogroup" aria-label="Template" class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
    <TemplatePickerOption
      v-for="t in props.templates"
      :key="t.id"
      :template="t"
      :selected="selected === t.id"
      @select="selected = t.id"
    />
  </div>
</template>
