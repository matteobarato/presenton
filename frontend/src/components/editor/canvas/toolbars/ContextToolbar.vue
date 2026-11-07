<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import { toolbarKind } from '@/slide-editor/toolbarKind'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import GenericToolbar from './GenericToolbar.vue'
import MultiToolbar from './MultiToolbar.vue'
import { container, divider, tool } from './toolbarClasses'

const ctx = useSlideEditingContext()
const kind = computed(() => toolbarKind(ctx.ui.value, ctx.selection.value))
// Tasks 9 and 10 replace the text and image slots; until then they get the generic tools.
const body = computed(() => (kind.value === 'multi' ? MultiToolbar : GenericToolbar))
</script>

<template>
  <!-- data-inline-edit-ignore: focus moving into the toolbar keeps the inline text editor open. -->
  <div role="toolbar" aria-label="Selection tools" :data-kind="kind" data-inline-edit-ignore="true" :class="container">
    <button type="button" :class="tool" aria-label="Deselect" title="Done (Esc)" @mousedown.prevent @click="ctx.select(null)">
      <X class="size-4" aria-hidden="true" />
    </button>
    <span :class="divider" aria-hidden="true" />
    <component :is="body" />
  </div>
</template>
