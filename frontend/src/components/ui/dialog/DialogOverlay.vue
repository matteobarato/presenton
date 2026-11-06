<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { type DialogOverlayProps, DialogOverlay, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DialogOverlayProps & { class?: HTMLAttributes['class'] }>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegated)
</script>

<template>
  <DialogOverlay v-bind="forwarded" :class="cn('glass-overlay anim-fade-in fixed inset-0 z-70', props.class)"><slot /></DialogOverlay>
</template>
