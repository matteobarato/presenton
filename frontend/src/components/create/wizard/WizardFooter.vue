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
    class="wizard-footer sticky z-10 mt-8 -mx-3 flex flex-col gap-2 rounded-t-[14px] px-3 pt-3"
    :aria-busy="busy ? 'true' : undefined"
    data-testid="wizard-footer"
  >
    <Alert v-if="error" variant="destructive" role="alert" class="flex items-center justify-between gap-3 py-2 text-[12px]">
      <span>{{ error }}</span>
      <Button v-if="hasRetry" type="button" size="sm" variant="outline" data-testid="footer-retry" @click="$emit('retry')">Retry</Button>
    </Alert>
    <div class="flex items-center gap-2.5 max-[520px]:flex-wrap">
      <slot name="back" />
      <p
        role="status"
        class="min-w-0 flex-1 text-right leading-snug text-[11px] text-[#a2b7c5] max-[520px]:order-last max-[520px]:basis-full max-[520px]:text-center"
      >
        <slot name="status">{{ status }}</slot>
      </p>
      <slot name="secondary" />
      <slot name="primary" />
    </div>
  </div>
</template>

<style scoped>
/*
 * One glass surface in the card's own tone (.workspace-card is #191d1f), so the bar reads as the card itself
 * frosting whatever scrolls under it.
 *
 * It reaches into .workspace-card's bottom padding instead of stacking its own padding on top of it: the negative
 * margin lets it fill that padding in flow, and `bottom` pins it to the card's edge once stuck. Same values and the
 * same inclusive breakpoints as the card's padding.
 */
.wizard-footer {
  --card-pad: 44px;
  bottom: calc(-1 * var(--card-pad));
  margin-bottom: calc(-1 * var(--card-pad));
  padding-bottom: 14px;
  background: rgb(25 29 31 / 0.84);
  backdrop-filter: blur(18px) saturate(1.3);
  -webkit-backdrop-filter: blur(18px) saturate(1.3);
}
@media (max-width: 1050px) {
  .wizard-footer { --card-pad: 38px; }
}
@media (max-width: 760px) {
  .wizard-footer { --card-pad: 30px; }
}
@media (max-width: 450px) {
  .wizard-footer { --card-pad: 27px; }
}
</style>
