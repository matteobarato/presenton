<script setup lang="ts">
import type { TtsLanguage } from '@/api/tts'

defineProps<{ languages: TtsLanguage[]; modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [code: string] }>()
</script>

<template>
  <label class="flex flex-col gap-1 text-[11px] text-muted">
    Narration language
    <select
      :value="modelValue"
      :disabled="disabled || languages.length === 0"
      data-testid="tts-language"
      class="h-[34px] rounded-control border border-white/[0.09] bg-transparent px-2 text-[12px] text-[#d4dadd] outline-none focus-visible:border-accent"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="l in languages" :key="l.code" :value="l.code" class="bg-dialog">{{ l.name }}</option>
    </select>
  </label>
</template>
