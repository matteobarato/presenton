<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useVModel } from '@vueuse/core'
import { cn } from '@/lib/utils'

const props = defineProps<{
  defaultValue?: string | number
  modelValue?: string | number
  class?: HTMLAttributes['class']
}>()
const emits = defineEmits<{ (e: 'update:modelValue', payload: string | number): void }>()
const modelValue = useVModel(props, 'modelValue', emits, { passive: true, defaultValue: props.defaultValue })
</script>

<template>
  <input
    v-model="modelValue"
    :class="cn('flex h-9 w-full min-w-0 rounded-button border border-transparent bg-field px-3 text-[12px] text-[#dce6ec] transition-colors duration-200 placeholder:text-muted hover:border-white/15 focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40', props.class)"
  />
</template>
