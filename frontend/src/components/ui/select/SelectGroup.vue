<script setup lang="ts">
import { type SelectGroupProps, SelectGroup } from 'reka-ui'

const props = defineProps<SelectGroupProps>()
</script>

<template>
  <SelectGroup v-bind="props"><slot /></SelectGroup>
</template>
