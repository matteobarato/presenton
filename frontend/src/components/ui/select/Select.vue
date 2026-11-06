<script setup lang="ts">
import { type SelectRootProps, type SelectRootEmits, SelectRoot, useForwardPropsEmits } from 'reka-ui'

const props = defineProps<SelectRootProps>()
const emits = defineEmits<SelectRootEmits>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <SelectRoot v-bind="forwarded"><slot /></SelectRoot>
</template>
