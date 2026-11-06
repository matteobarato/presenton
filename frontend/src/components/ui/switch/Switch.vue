<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { type SwitchRootEmits, type SwitchRootProps, SwitchRoot, SwitchThumb, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SwitchRootProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<SwitchRootEmits>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <SwitchRoot
    v-bind="forwarded"
    :class="cn('inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-[#424c52] transition-colors duration-200 data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-40', props.class)"
  >
    <SwitchThumb class="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-[#cee6f2] shadow-[0_2px_6px_#0004] transition-transform duration-200 data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-accent-ink" />
  </SwitchRoot>
</template>
