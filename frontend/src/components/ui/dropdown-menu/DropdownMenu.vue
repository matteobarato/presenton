<script setup lang="ts">
import { type DropdownMenuRootProps, type DropdownMenuRootEmits, DropdownMenuRoot, useForwardPropsEmits } from 'reka-ui'

const props = defineProps<DropdownMenuRootProps>()
const emits = defineEmits<DropdownMenuRootEmits>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DropdownMenuRoot v-bind="forwarded"><slot /></DropdownMenuRoot>
</template>
