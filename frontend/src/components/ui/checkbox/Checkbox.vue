<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { Check } from 'lucide-vue-next'
import { type CheckboxRootEmits, type CheckboxRootProps, CheckboxIndicator, CheckboxRoot, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<CheckboxRootProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<CheckboxRootEmits>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <CheckboxRoot
    v-bind="forwarded"
    :class="cn('grid size-4 shrink-0 place-items-center rounded-[5px] border border-white/25 bg-field transition-colors duration-200 data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-ink disabled:cursor-not-allowed disabled:opacity-40', props.class)"
  >
    <CheckboxIndicator class="grid place-items-center"><Check :size="12" :stroke-width="3" /></CheckboxIndicator>
  </CheckboxRoot>
</template>
