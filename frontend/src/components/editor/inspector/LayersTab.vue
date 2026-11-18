<script setup lang="ts">
import { computed } from 'vue'
import { layerTree } from '@/slide-editor/layerTree'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import LayerTree from './element/LayerTree.vue'

// Inspector hands every tab the presentation and slide; the layer list needs neither, so keep them off the root element.
defineOptions({ inheritAttrs: false })

const ctx = useSlideEditingContext()
const layers = computed(() => (ctx.enabled.value ? layerTree(ctx.ui.value) : []))
</script>

<template>
  <!-- data-inline-edit-ignore: focus moving into the inspector keeps the inline text editor open. -->
  <section class="flex flex-1 flex-col px-5 pb-[18px] max-[1279px]:px-4 min-[1600px]:px-[23px]" aria-label="Layers" data-inline-edit-ignore="true">
    <div v-if="ctx.enabled.value" class="flex flex-col">
      <div class="pt-6 pb-[18px] min-[1600px]:pt-7 [@media(max-height:780px)_and_(min-width:1051px)]:pt-[17px]">
        <h2 class="text-[19px] font-medium tracking-[-0.04em] text-[#f0f2f3] max-[1279px]:text-[18px] min-[1600px]:text-[22px]">Layers</h2>
        <p class="mt-[5px] text-[10px] leading-[1.6] text-[#a0abb1]">Select something on the slide to edit it. Double-click text to type.</p>
      </div>
      <LayerTree :nodes="layers" />
    </div>
    <div v-else class="pt-6">
      <h2 class="text-[19px] font-medium tracking-[-0.04em] text-[#f0f2f3] max-[1279px]:text-[18px] min-[1600px]:text-[22px]">
        This slide can't be edited on the canvas.
      </h2>
    </div>
  </section>
</template>
