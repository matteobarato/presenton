<script setup lang="ts">
import { type TooltipRootProps, type TooltipRootEmits, TooltipRoot, useForwardPropsEmits } from 'reka-ui'

const props = defineProps<TooltipRootProps>()
const emits = defineEmits<TooltipRootEmits>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <TooltipRoot v-bind="forwarded"><slot /></TooltipRoot>
</template>
