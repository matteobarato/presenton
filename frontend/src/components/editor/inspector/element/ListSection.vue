<script setup lang="ts">
import SegmentedControl from '@/components/editor/inspector/controls/SegmentedControl.vue'
import { label, section } from '@/components/editor/inspector/controls/styles'
import { readListMarker, setListMarker } from '@/slide-editor/elementStyle'
import { useSelectedElement } from '@/slide-editor/useSelectedElement'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

const { element, patch } = useSelectedElement(useSlideEditingContext())

const MARKERS = [
  { value: 'bullet', label: 'Bullet' },
  { value: 'number', label: 'Number' },
  { value: 'none', label: 'None' },
]
const choose = (m: string) => patch('List marker', (el) => setListMarker(el, m as 'bullet' | 'number' | 'none'))
</script>

<template>
  <div v-if="element" :class="section">
    <div :class="label"><h3>Marker</h3></div>
    <SegmentedControl :model-value="readListMarker(element)" :options="MARKERS" label="Marker" @update:model-value="choose" />
  </div>
</template>
