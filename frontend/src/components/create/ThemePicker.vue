<script setup lang="ts">
import type { ThemeRecord } from '@/api/themes'
import ThemeSwatch from '@/components/editor/inspector/ThemeSwatch.vue'

defineProps<{ themes: ThemeRecord[]; disabled?: boolean }>()
const model = defineModel<string | null>({ default: null })
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-x-3 gap-y-[13px]" role="group" aria-label="Theme">
    <div data-testid="theme-option-none">
      <ThemeSwatch name="Template colours" :theme="null" :selected="model === null" :custom="false" :disabled="disabled" @select="model = null" />
    </div>
    <div v-for="t in themes" :key="t.id" :data-testid="`theme-option-${t.id}`">
      <ThemeSwatch :name="t.name" :theme="t" :selected="model === t.id" :custom="false" :disabled="disabled" @select="model = t.id" />
    </div>
  </div>
</template>
