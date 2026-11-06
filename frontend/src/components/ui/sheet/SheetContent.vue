<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { X } from 'lucide-vue-next'
import { type DialogContentEmits, type DialogContentProps, DialogClose, DialogContent, DialogOverlay, DialogPortal, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

interface Props extends DialogContentProps {
  class?: HTMLAttributes['class']
  side?: 'left' | 'right'
}
const props = withDefaults(defineProps<Props>(), { side: 'right' })
const emits = defineEmits<DialogContentEmits>()
const delegated = reactiveOmit(props, 'class', 'side')
const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay class="anim-fade-in fixed inset-0 z-50 bg-[#080c0f80] backdrop-blur-[3px]" />
    <DialogContent
      v-bind="forwarded"
      :class="
        cn(
          'fixed inset-y-3 z-55 flex w-[min(320px,calc(100vw-24px))] flex-col overflow-y-auto rounded-panel bg-inspector text-text shadow-[0_20px_50px_#0005] outline-none',
          side === 'right' ? 'anim-sheet-right right-3' : 'anim-sheet-left left-3',
          props.class,
        )
      "
    >
      <slot />
      <DialogClose class="absolute top-3 right-3 grid size-7 place-items-center rounded-control text-muted hover:bg-white/10 hover:text-white" aria-label="Close panel">
        <X :size="16" />
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
