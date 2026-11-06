<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { type ProgressRootProps, ProgressIndicator, ProgressRoot } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<ProgressRootProps & { class?: HTMLAttributes['class'] }>(), { modelValue: 0 })
const delegated = reactiveOmit(props, 'class')
</script>

<template>
  <ProgressRoot v-bind="delegated" :class="cn('relative h-1.5 w-full overflow-hidden rounded-full bg-[#424c52]', props.class)">
    <ProgressIndicator
      class="h-full w-full rounded-full bg-accent transition-transform duration-200 ease-out"
      :style="`transform: translateX(-${100 - (props.modelValue ?? 0)}%)`"
    />
  </ProgressRoot>
</template>
