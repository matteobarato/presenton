<script setup lang="ts">
import { type TooltipTriggerProps, TooltipTrigger } from 'reka-ui'

const props = defineProps<TooltipTriggerProps>()
</script>

<template>
  <TooltipTrigger v-bind="props"><slot /></TooltipTrigger>
</template>
