<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { type DropdownMenuSeparatorProps, DropdownMenuSeparator, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DropdownMenuSeparatorProps & { class?: HTMLAttributes['class'] }>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegated)
</script>

<template>
  <DropdownMenuSeparator v-bind="forwarded" :class="cn('-mx-1.5 my-1.5 h-px bg-line', props.class)" />
</template>
