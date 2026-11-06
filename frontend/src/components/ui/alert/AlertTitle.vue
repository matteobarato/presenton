<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <h5 :class="cn('mb-1 text-[12px] leading-none font-semibold tracking-[-0.01em]', props.class)"><slot /></h5>
</template>
