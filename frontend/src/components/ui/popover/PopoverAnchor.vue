<script setup lang="ts">
import { type PopoverAnchorProps, PopoverAnchor } from 'reka-ui'

const props = defineProps<PopoverAnchorProps>()
</script>

<template>
  <PopoverAnchor v-bind="props"><slot /></PopoverAnchor>
</template>
