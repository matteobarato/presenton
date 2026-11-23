<script setup lang="ts">
import { ref } from 'vue'
import { ListPlus } from 'lucide-vue-next'
import { tool } from '@/components/editor/canvas/toolbars/toolbarClasses'
import InfographicItemsDialog from '@/components/editor/inspector/element/InfographicItemsDialog.vue'
import { useInfographicControls } from '@/components/editor/inspector/element/useInfographicControls'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Bar control: Edit items (item-based infographics only). Owns the dialog, so it stays mounted while the bar is shown.
const { root, group } = useInfographicControls()
const open = ref(false)
</script>

<template>
  <button
    v-if="root && group === 'items'"
    type="button"
    :class="tool"
    :aria-label="t('editorCanvas.controls.infographic.editItems')"
    :title="t('editorCanvas.controls.infographic.editItems')"
    data-bar-item="infographic-edit-items"
    @mousedown.prevent
    @click="open = true"
  >
    <ListPlus class="size-4" aria-hidden="true" />
  </button>
  <InfographicItemsDialog v-if="root && group === 'items'" v-model:open="open" :root="root" />
</template>
