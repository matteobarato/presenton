<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SegmentedControl from '@/components/editor/inspector/controls/SegmentedControl.vue'
import { label, section } from '@/components/editor/inspector/controls/styles'
import { MARKERS, useListMarker } from './useListMarker'

const { t } = useI18n()

const { element, marker, choose } = useListMarker()
</script>

<template>
  <div v-if="element" :class="section">
    <div :class="label"><h3>{{ t('editorInspector.element.list.marker') }}</h3></div>
    <SegmentedControl :model-value="marker ?? 'bullet'" :options="[...MARKERS]" :label="t('editorInspector.element.list.marker')" @update:model-value="choose" />
  </div>
</template>
