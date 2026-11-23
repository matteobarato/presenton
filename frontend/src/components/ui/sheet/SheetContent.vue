<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { X } from 'lucide-vue-next'
import { type DialogContentEmits, type DialogContentProps, DialogClose, DialogContent, DialogOverlay, DialogPortal, useForwardPropsEmits } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import { cn } from '@/lib/utils'

interface Props extends DialogContentProps {
  class?: HTMLAttributes['class']
  side?: 'left' | 'right' | 'bottom'
}
const props = withDefaults(defineProps<Props>(), { side: 'right' })
const { t } = useI18n()
const emits = defineEmits<DialogContentEmits>()
const delegated = reactiveOmit(props, 'class', 'side')
const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay class="anim-fade-in fixed inset-0 z-50 bg-sx-080c0f80 backdrop-blur-[3px]" />
    <DialogContent
      v-bind="forwarded"
      :class="
        cn(
          'fixed z-55 flex flex-col overflow-y-auto rounded-panel bg-inspector text-text shadow-[0_20px_50px_#0005] outline-none',
          side === 'bottom'
            ? 'anim-sheet-bottom inset-x-3 bottom-3 max-h-[85dvh]'
            : ['inset-y-3 w-[min(320px,calc(100vw-24px))]', side === 'right' ? 'anim-sheet-right right-3' : 'anim-sheet-left left-3'],
          props.class,
        )
      "
    >
      <slot />
      <DialogClose class="absolute top-3 right-3 max-[559px]:top-1.5 max-[559px]:right-1.5 grid size-7 max-[559px]:size-11 place-items-center rounded-control text-muted hover:bg-ov/10 hover:text-white" :aria-label="t('ui.sheet.close')">
        <X :size="16" />
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
