<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { type LabelProps, Label, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<LabelProps & { class?: HTMLAttributes['class'] }>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegated)
</script>

<template>
  <Label v-bind="forwarded" :class="cn('text-[11px] font-medium text-[#c0cfd6] select-none', props.class)"><slot /></Label>
</template>
