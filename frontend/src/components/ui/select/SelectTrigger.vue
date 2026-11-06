<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { ChevronDown } from 'lucide-vue-next'
import { type SelectTriggerProps, SelectIcon, SelectTrigger, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SelectTriggerProps & { class?: HTMLAttributes['class'] }>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegated)
</script>

<template>
  <SelectTrigger
    v-bind="forwarded"
    :class="cn('flex h-9 w-full items-center justify-between gap-2 rounded-button border border-transparent bg-field px-3 text-[11px] text-[#dce6ec] transition-colors duration-200 hover:border-white/15 focus-visible:border-accent data-[placeholder]:text-muted disabled:cursor-not-allowed disabled:opacity-40', props.class)"
  >
    <slot />
    <SelectIcon as-child><ChevronDown :size="14" class="text-muted" /></SelectIcon>
  </SelectTrigger>
</template>
