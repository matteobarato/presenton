<script setup lang="ts">
import type { Presentation, Slide } from '@/api/types'

defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()
</script>

<template>
  <section aria-label="Insert" data-inline-edit-ignore="true" />
</template>
