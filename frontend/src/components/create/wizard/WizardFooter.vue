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
    class="sticky bottom-[-44px] z-10 mt-8 -mx-3 flex flex-col gap-2.5 rounded-t-[14px] bg-[#191d1fee] px-3 pt-4 pb-[44px] backdrop-blur-[10px] max-[1050px]:bottom-[-38px] max-[1050px]:pb-[38px] max-[760px]:bottom-[-30px] max-[760px]:pb-[30px] max-[450px]:bottom-[-27px] max-[450px]:pb-[27px]"
    :aria-busy="busy ? 'true' : undefined"
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
    <p role="status" class="min-h-[1em] text-right text-[11px] text-[#a2b7c5] max-[520px]:text-center">{{ status }}</p>
  </div>
</template>
