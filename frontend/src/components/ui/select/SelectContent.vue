<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { type SelectContentEmits, type SelectContentProps, SelectContent, SelectPortal, SelectViewport, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<SelectContentProps & { class?: HTMLAttributes['class'] }>(), { position: 'popper', sideOffset: 6 })
const emits = defineEmits<SelectContentEmits>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <SelectPortal>
    <SelectContent
      v-bind="{ ...forwarded, ...$attrs }"
      :class="cn('glass-popover anim-pop-in z-80 max-h-72 min-w-[var(--reka-select-trigger-width)] overflow-hidden text-[#dce8ee]', props.class)"
    >
      <SelectViewport class="p-1.5"><slot /></SelectViewport>
    </SelectContent>
  </SelectPortal>
</template>
