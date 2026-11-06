<script setup lang="ts">
import { type DialogCloseProps, DialogClose } from 'reka-ui'

const props = defineProps<DialogCloseProps>()
</script>

<template>
  <DialogClose v-bind="props"><slot /></DialogClose>
</template>
