<script setup lang="ts">
import type { Slide } from '@/api/types'

defineProps<{ presentationId: string; slide: Slide | null }>()
</script>

<template>
  <section data-stub="EditorCanvas">EditorCanvas</section>
</template>
