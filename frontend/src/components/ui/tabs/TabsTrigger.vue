<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { type TabsTriggerProps, TabsTrigger, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<TabsTriggerProps & { class?: HTMLAttributes['class'] }>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegated)
</script>

<template>
  <TabsTrigger v-bind="forwarded" :class="cn('inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-control px-3 text-[11px] font-semibold whitespace-nowrap text-muted transition-colors duration-200 hover:text-white disabled:pointer-events-none disabled:opacity-40 data-[state=active]:bg-[#222b30] data-[state=active]:text-[#c2e5f5]', props.class)"><slot /></TabsTrigger>
</template>
