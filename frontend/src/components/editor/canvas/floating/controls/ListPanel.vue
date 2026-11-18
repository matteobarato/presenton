<script setup lang="ts">
import type { Presentation } from '@/api/types'
import ListSection from '@/components/editor/inspector/element/ListSection.vue'
import TextSection from '@/components/editor/inspector/element/TextSection.vue'
import PanelBody from '../PanelBody.vue'

// The List kind's panel: the Text section, then the Marker section.
defineProps<{ presentation: Presentation }>()
</script>

<template>
  <PanelBody>
    <TextSection :presentation="presentation" />
    <ListSection />
  </PanelBody>
</template>
