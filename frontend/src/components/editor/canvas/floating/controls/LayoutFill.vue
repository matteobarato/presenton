<script setup lang="ts">
import type { Presentation } from '@/api/types'
import { useLayoutControls } from '@/components/editor/inspector/element/useLayoutControls'
import BarColor from './BarColor.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Bar control: a container layout's fill colour. Flex and grid layouts have no fill, so nothing shows for them.
const props = defineProps<{ presentation: Presentation }>()
const { isContainer, container, palette, hold, fillColour } = useLayoutControls(() => props.presentation)
</script>

<template>
  <BarColor
    v-if="isContainer && container"
    id="layout-fill"
    :label="t('editorCanvas.controls.layout.fillColour')"
    :value="container.fillColor"
    :palette="palette"
    @open="hold"
    @pick="fillColour"
  />
</template>
