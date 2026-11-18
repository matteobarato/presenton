<script setup lang="ts">
import type { Presentation } from '@/api/types'
import { useTextControls } from '@/components/editor/inspector/element/useTextControls'
import { active, tool } from '@/components/editor/canvas/toolbars/toolbarClasses'

// Bar controls: left / centre / right (Justify stays in the Text panel).
const props = defineProps<{ presentation: Presentation }>()
const { alignment, aligns, setAlign } = useTextControls(props)
const quick = ['left', 'center', 'right']
</script>

<template>
  <button
    v-for="a in aligns.filter((x) => quick.includes(x.value))"
    :key="a.value"
    type="button"
    :class="[tool, alignment === a.value && active]"
    :aria-label="a.label"
    :aria-pressed="alignment === a.value"
    :title="a.label"
    :data-bar-item="`align-${a.value}`"
    @mousedown.prevent
    @click="setAlign(a.value)"
  >
    <component :is="a.icon" class="size-4" aria-hidden="true" />
  </button>
</template>
