<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { type DropdownMenuItemProps, DropdownMenuItem, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DropdownMenuItemProps & { class?: HTMLAttributes['class'] }>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegated)
</script>

<template>
  <DropdownMenuItem v-bind="forwarded" :class="cn('relative flex cursor-default items-center gap-2 rounded-control px-2.5 py-2 text-[11px] text-[#d4dadd] outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-white/10 data-[highlighted]:text-white', props.class)"><slot /></DropdownMenuItem>
</template>
