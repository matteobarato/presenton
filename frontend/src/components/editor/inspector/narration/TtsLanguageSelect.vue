<script setup lang="ts">
import type { TtsLanguage } from '@/api/tts'

defineProps<{ languages: TtsLanguage[]; modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [code: string] }>()
</script>

<template>
  <label class="flex items-center gap-3 text-[11px] text-muted">
    <span class="flex-none whitespace-nowrap">Narration language</span>
    <select
      :value="modelValue"
      :disabled="disabled || languages.length === 0"
      data-testid="tts-language"
      class="h-8 min-w-0 flex-1 rounded-control border border-ov/[0.09] bg-transparent px-2 text-[12px] text-tx-d4dadd outline-none hover:border-ov/[0.16] focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="l in languages" :key="l.code" :value="l.code" class="bg-dialog">{{ l.name }}</option>
    </select>
  </label>
</template>
