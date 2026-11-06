<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'reka-ui'
import { X } from 'lucide-vue-next'
defineProps<{ open: boolean; title: string; description?: string; wide?: boolean }>()
defineEmits<{ 'update:open': [value: boolean] }>()
</script>
<template><DialogRoot :open="open" @update:open="v => $emit('update:open', v)"><DialogPortal><DialogOverlay class="dialog-overlay" /><DialogContent class="dialog-content" :class="{ 'dialog-wide': wide }"><DialogTitle class="dialog-title">{{ title }}</DialogTitle><DialogDescription class="dialog-description">{{ description }}</DialogDescription><DialogClose class="dialog-close" aria-label="Close dialog"><X :size="18" /></DialogClose><slot /></DialogContent></DialogPortal></DialogRoot></template>
