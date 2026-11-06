<script setup lang="ts">
import type { Slide } from '@/api/types'

defineProps<{ presentationId: string; slides: Slide[] }>()
</script>

<template>
  <section data-stub="SlideNavigator">SlideNavigator</section>
</template>
