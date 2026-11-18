<script setup lang="ts">
import type { Presentation } from '@/api/types'
import { MARKS, useTextControls } from '@/components/editor/inspector/element/useTextControls'
import { active, tool } from '@/components/editor/canvas/toolbars/toolbarClasses'

// Bar controls: Bold / Italic / Underline. Pressed state follows the inline editor's selection or the element font.
const props = defineProps<{ presentation: Presentation }>()
const { isOn, toggle } = useTextControls(props)
</script>

<template>
  <button
    v-for="m in MARKS"
    :key="m.mark"
    type="button"
    :class="[tool, isOn(m.mark) && active]"
    :aria-label="m.label"
    :aria-pressed="isOn(m.mark)"
    :title="m.title"
    :data-bar-item="m.mark"
    @mousedown.prevent
    @click="toggle(m.mark)"
  >
    <component :is="m.icon" class="size-4" aria-hidden="true" />
  </button>
</template>
