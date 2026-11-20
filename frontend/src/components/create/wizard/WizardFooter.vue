<script setup lang="ts">
import { getCurrentInstance } from 'vue'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/** Sticky action bar shared by every wizard step. Always say why a primary action is unavailable via `status`. */
defineProps<{ status?: string; error?: string | null; busy?: boolean }>()
defineEmits<{ retry: [] }>()

// Retry is only offered when the parent listens for it.
const hasRetry = !!getCurrentInstance()?.vnode.props?.onRetry
</script>

<template>
  <div
    class="sticky wizard-footer z-10 mt-8 -mx-3 flex flex-col gap-2.5 rounded-t-[14px] bg-[#191d1fee] px-3 pt-4 backdrop-blur-[10px]"
    :aria-busy="busy ? 'true' : undefined"
    data-testid="wizard-footer"
  >
    <Alert v-if="error" variant="destructive" role="alert" class="flex items-center justify-between gap-3 py-2 text-[12px]">
      <span>{{ error }}</span>
      <Button v-if="hasRetry" type="button" size="sm" variant="outline" data-testid="footer-retry" @click="$emit('retry')">Retry</Button>
    </Alert>
    <div class="flex items-center gap-2.5 max-[520px]:flex-wrap">
      <slot name="back" />
      <span class="flex-1 max-[520px]:hidden" />
      <slot name="secondary" />
      <slot name="primary" />
    </div>
    <p role="status" class="min-h-[1em] text-right text-[11px] text-[#a2b7c5] max-[520px]:text-center"><slot name="status">{{ status }}</slot></p>
  </div>
</template>

<style scoped>
/* Pinned over .workspace-card's bottom padding: same values and the same inclusive breakpoints as that card. */
.wizard-footer {
  bottom: -44px;
  padding-bottom: 44px;
}
@media (max-width: 1050px) {
  .wizard-footer {
    bottom: -38px;
    padding-bottom: 38px;
  }
}
@media (max-width: 760px) {
  .wizard-footer {
    bottom: -30px;
    padding-bottom: 30px;
  }
}
@media (max-width: 450px) {
  .wizard-footer {
    bottom: -27px;
    padding-bottom: 27px;
  }
}
</style>
