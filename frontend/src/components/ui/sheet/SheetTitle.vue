<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { type DialogTitleProps, DialogTitle, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DialogTitleProps & { class?: HTMLAttributes['class'] }>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegated)
</script>

<template>
  <DialogTitle v-bind="forwarded" :class="cn('text-[19px] font-medium tracking-[-0.04em] text-[#f0f2f3]', props.class)"><slot /></DialogTitle>
</template>
