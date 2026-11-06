<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { type TooltipContentEmits, type TooltipContentProps, TooltipContent, TooltipPortal, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<TooltipContentProps & { class?: HTMLAttributes['class'] }>(), { sideOffset: 6 })
const emits = defineEmits<TooltipContentEmits>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <TooltipPortal>
    <TooltipContent
      v-bind="forwarded"
      :class="cn('anim-pop-in z-80 rounded-control border border-[#a3c7db20] bg-dialog px-2.5 py-1.5 text-[10px] text-[#dce8ee] shadow-[0_8px_24px_#0005]', props.class)"
    >
      <slot />
    </TooltipContent>
  </TooltipPortal>
</template>
