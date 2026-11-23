<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { X } from 'lucide-vue-next'
import { type DialogContentEmits, type DialogContentProps, DialogClose, DialogContent, DialogPortal, useForwardPropsEmits } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import { cn } from '@/lib/utils'
import DialogOverlay from './DialogOverlay.vue'

defineOptions({ inheritAttrs: false })
const props = defineProps<DialogContentProps & { class?: HTMLAttributes['class'] }>()
const { t } = useI18n()
const emits = defineEmits<DialogContentEmits>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay />
    <DialogContent
      v-bind="{ ...forwarded, ...$attrs }"
      :class="
        cn(
          'anim-dialog-in fixed top-1/2 left-1/2 z-71 w-[min(490px,calc(100vw-32px))] max-h-[calc(100dvh-40px)] overflow-y-auto',
          'rounded-dialog border border-lx-a3c7db20 bg-dialog p-8 text-popover-foreground shadow-[0_30px_100px_#0008] outline-none [transform:translate(-50%,-50%)]',
          props.class,
        )
      "
    >
      <slot />
      <DialogClose
        class="absolute top-[13px] right-[13px] grid size-[26px] place-items-center rounded-full text-tx-a4bbc9 hover:bg-sx-3b4b55"
        :aria-label="t('ui.dialog.close')"
      >
        <X :size="18" />
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
