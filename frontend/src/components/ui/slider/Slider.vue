<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { type SliderRootEmits, type SliderRootProps, SliderRange, SliderRoot, SliderThumb, SliderTrack, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SliderRootProps & { class?: HTMLAttributes['class']; label?: string }>()
const emits = defineEmits<SliderRootEmits>()
const delegated = reactiveOmit(props, 'class', 'label')
const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <SliderRoot v-slot="{ modelValue }" v-bind="forwarded" :class="cn('relative flex h-4 w-full touch-none items-center select-none', props.class)">
    <SliderTrack class="relative h-[3px] grow overflow-hidden rounded-full bg-[#424c52]">
      <SliderRange class="absolute h-full rounded-full bg-[#a9cbdc]" />
    </SliderTrack>
    <SliderThumb
      v-for="(_, i) in modelValue"
      :key="i"
      :aria-label="label ?? 'Value'"
      class="block size-2.5 rounded-full bg-[#cee6f2] shadow-[0_2px_6px_#0004] outline-none focus-visible:shadow-[0_0_0_3px_#bde3f333]"
    />
  </SliderRoot>
</template>
