<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <h3 :class="cn('text-[15px] leading-none font-medium tracking-[-0.02em]', props.class)"><slot /></h3>
</template>
