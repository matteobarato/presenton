<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { type DialogDescriptionProps, DialogDescription, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DialogDescriptionProps & { class?: HTMLAttributes['class'] }>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegated)
</script>

<template>
  <DialogDescription v-bind="forwarded" :class="cn('text-[11px] leading-[1.8] text-[#9fb4c1] max-w-[94%]', props.class)"><slot /></DialogDescription>
</template>
