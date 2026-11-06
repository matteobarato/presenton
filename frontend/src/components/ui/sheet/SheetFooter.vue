<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div :class="cn('mt-auto flex flex-col gap-2 px-5 pb-5', props.class)"><slot /></div>
</template>
