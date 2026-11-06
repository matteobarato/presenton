<script setup lang="ts">
import { type DropdownMenuTriggerProps, DropdownMenuTrigger } from 'reka-ui'

const props = defineProps<DropdownMenuTriggerProps>()
</script>

<template>
  <DropdownMenuTrigger v-bind="props"><slot /></DropdownMenuTrigger>
</template>
