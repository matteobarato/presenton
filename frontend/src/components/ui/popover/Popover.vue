<script setup lang="ts">
import { type PopoverRootProps, type PopoverRootEmits, PopoverRoot, useForwardPropsEmits } from 'reka-ui'

const props = defineProps<PopoverRootProps>()
const emits = defineEmits<PopoverRootEmits>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <PopoverRoot v-bind="forwarded"><slot /></PopoverRoot>
</template>
