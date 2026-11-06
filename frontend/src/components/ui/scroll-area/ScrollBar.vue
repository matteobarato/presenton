<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { type ScrollAreaScrollbarProps, ScrollAreaScrollbar, ScrollAreaThumb } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<ScrollAreaScrollbarProps & { class?: HTMLAttributes['class'] }>(), { orientation: 'vertical' })
const delegated = reactiveOmit(props, 'class')
</script>

<template>
  <ScrollAreaScrollbar
    v-bind="delegated"
    :class="cn('flex touch-none p-px transition-colors select-none', orientation === 'vertical' && 'h-full w-2 border-l border-l-transparent', orientation === 'horizontal' && 'h-2 flex-col border-t border-t-transparent', props.class)"
  >
    <ScrollAreaThumb class="relative flex-1 rounded-full bg-[#4a5961]" />
  </ScrollAreaScrollbar>
</template>
