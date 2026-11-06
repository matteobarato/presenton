<script setup lang="ts">
import type { Slide } from '@/api/types'

defineProps<{ open: boolean; slide: Slide }>()
defineEmits<{ 'update:open': [value: boolean]; edited: [] }>()
</script>

<template>
  <section data-stub="AskOverlay">AskOverlay</section>
</template>
