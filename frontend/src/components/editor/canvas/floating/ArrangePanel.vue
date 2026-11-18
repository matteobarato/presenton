<script setup lang="ts">
import ArrangeSection from '@/components/editor/inspector/element/ArrangeSection.vue'
import LayerChildren from '@/components/editor/inspector/element/LayerChildren.vue'
import OrderSection from '@/components/editor/inspector/element/OrderSection.vue'
import PanelBody from './PanelBody.vue'
</script>

<template>
  <PanelBody>
    <ArrangeSection />
    <OrderSection />
    <LayerChildren />
  </PanelBody>
</template>
