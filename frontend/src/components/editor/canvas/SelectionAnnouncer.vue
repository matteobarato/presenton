<script setup lang="ts">
import { ref, watch } from 'vue'
import { selectionLabel } from '@/slide-editor/toolbarKind'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

/** Screen-reader announcement of the on-slide selection (the overlay itself is pointer-only). */
const ctx = useSlideEditingContext()
const message = ref('')

watch(
  () => JSON.stringify(ctx.selection.value),
  () => {
    const sel = ctx.selection.value
    const label = selectionLabel(ctx.ui.value, sel)
    if (sel?.kind === 'multi-component') message.value = `${label} selected`
    else if (label) message.value = `Selected: ${label}`
    else if (message.value) message.value = 'Selection cleared'
  },
)
</script>

<template>
  <div role="status" aria-live="polite" class="sr-only">{{ message }}</div>
</template>
