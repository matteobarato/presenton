<script setup lang="ts">
import { type SelectValueProps, SelectValue } from 'reka-ui'

const props = defineProps<SelectValueProps>()
</script>

<template>
  <SelectValue v-bind="props"><slot /></SelectValue>
</template>
