<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { type PopoverContentEmits, type PopoverContentProps, PopoverContent, PopoverPortal, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<PopoverContentProps & { class?: HTMLAttributes['class'] }>(), { align: 'center', sideOffset: 6 })
const emits = defineEmits<PopoverContentEmits>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <PopoverPortal>
    <PopoverContent
      v-bind="{ ...forwarded, ...$attrs }"
      :class="cn('glass-popover anim-pop-in z-80 w-72 p-4 text-[#dce8ee] outline-none', props.class)"
    >
      <slot />
    </PopoverContent>
  </PopoverPortal>
</template>
