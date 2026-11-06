<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { Check } from 'lucide-vue-next'
import { type SelectItemProps, SelectItem, SelectItemIndicator, SelectItemText, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SelectItemProps & { class?: HTMLAttributes['class'] }>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegated)
</script>

<template>
  <SelectItem v-bind="forwarded" :class="cn('relative flex w-full cursor-default items-center gap-2 rounded-control px-2.5 py-2 text-[11px] text-[#d4dadd] outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-white/10 data-[highlighted]:text-white pl-7', props.class)">
    <span class="absolute left-2 flex size-3.5 items-center justify-center">
      <SelectItemIndicator><Check :size="12" /></SelectItemIndicator>
    </span>
    <SelectItemText><slot /></SelectItemText>
  </SelectItem>
</template>
