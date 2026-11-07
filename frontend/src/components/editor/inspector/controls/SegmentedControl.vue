<script setup lang="ts">
import type { Component } from 'vue'
import { segment, segmentOn } from './styles'

defineProps<{ modelValue: string; options: { value: string; label: string; icon?: Component }[]; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div role="group" :aria-label="label" class="flex gap-2">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      :class="[segment, 'text-[10px]', modelValue === o.value && segmentOn]"
      :aria-label="o.label"
      :aria-pressed="modelValue === o.value"
      :title="o.label"
      @click="emit('update:modelValue', o.value)"
    >
      <component :is="o.icon" v-if="o.icon" class="size-4" aria-hidden="true" />
      <template v-else>{{ o.label }}</template>
    </button>
  </div>
</template>
