<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div :class="cn('flex flex-col gap-1.5 px-5 pt-6 pb-4', props.class)"><slot /></div>
</template>
