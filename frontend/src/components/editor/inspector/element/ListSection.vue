<script setup lang="ts">
import SegmentedControl from '@/components/editor/inspector/controls/SegmentedControl.vue'
import { label, section } from '@/components/editor/inspector/controls/styles'
import { MARKERS, useListMarker } from './useListMarker'

const { element, marker, choose } = useListMarker()
</script>

<template>
  <div v-if="element" :class="section">
    <div :class="label"><h3>Marker</h3></div>
    <SegmentedControl :model-value="marker ?? 'bullet'" :options="[...MARKERS]" label="Marker" @update:model-value="choose" />
  </div>
</template>
