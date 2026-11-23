<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { selectionLabel } from '@/slide-editor/toolbarKind'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

/** Screen-reader announcement of the on-slide selection (the overlay itself is pointer-only). */
const ctx = useSlideEditingContext()
const { t } = useI18n()
const message = ref('')

// A picked table cell is announced too ("Cell"), so the cell is part of what is watched.
watch(
  () => JSON.stringify([ctx.selection.value, ctx.tableCell?.value ?? null]),
  () => {
    const sel = ctx.selection.value
    const label = selectionLabel(ctx.ui.value, sel, ctx.tableCell?.value)
    if (sel?.kind === 'multi-component') message.value = t('editorCanvas.announcer.multiSelected', { label })
    else if (label) message.value = t('editorCanvas.announcer.selected', { label })
    else if (message.value) message.value = t('editorCanvas.announcer.cleared')
  },
)
</script>

<template>
  <div role="status" aria-live="polite" class="sr-only">{{ message }}</div>
</template>
