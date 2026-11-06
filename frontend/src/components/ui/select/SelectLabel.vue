<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { type SelectLabelProps, SelectLabel, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SelectLabelProps & { class?: HTMLAttributes['class'] }>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegated)
</script>

<template>
  <SelectLabel v-bind="forwarded" :class="cn('px-2.5 py-1.5 text-[10px] font-semibold text-muted', props.class)"><slot /></SelectLabel>
</template>
