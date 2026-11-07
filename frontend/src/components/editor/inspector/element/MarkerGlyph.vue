<script setup lang="ts">
import type { VectorMarker } from '@/slide-editor/elementStyle'

// A line with the marker drawn at its right end; `side="start"` mirrors it.
defineProps<{ marker: VectorMarker; side: 'start' | 'end' }>()
</script>

<template>
  <svg viewBox="0 0 28 16" class="h-4 w-7 shrink-0" :class="side === 'start' && '-scale-x-100'" fill="currentColor" stroke="currentColor" aria-hidden="true">
    <line x1="2" y1="8" :x2="{ none: 26, arrow: 24, stealth: 22, triangle: 20, circle: 20, square: 18, diamond: 16 }[marker]" y2="8" stroke-width="1.5" />
    <polyline v-if="marker === 'arrow'" points="19,3 25,8 19,13" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    <polygon v-else-if="marker === 'stealth'" points="26,8 18,3 21,8 18,13" stroke="none" />
    <polygon v-else-if="marker === 'triangle'" points="26,8 19,3 19,13" stroke="none" />
    <circle v-else-if="marker === 'circle'" cx="22" cy="8" r="4" stroke="none" />
    <rect v-else-if="marker === 'square'" x="18" y="4" width="8" height="8" stroke="none" />
    <polygon v-else-if="marker === 'diamond'" points="26,8 21,3 16,8 21,13" stroke="none" />
  </svg>
</template>
