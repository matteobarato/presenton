<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { type TabsListProps, TabsList, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<TabsListProps & { class?: HTMLAttributes['class'] }>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegated)
</script>

<template>
  <TabsList v-bind="forwarded" :class="cn('inline-flex items-center gap-1.5 rounded-card bg-field p-1', props.class)"><slot /></TabsList>
</template>
