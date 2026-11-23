<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { getCurrentInstance } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { RouterLink } from 'vue-router'
import { Ellipsis } from 'lucide-vue-next'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { FooterAction } from './stepFooter'
const { t } = useI18n()

/** Sticky action bar shared by every wizard step. Always say why a primary action is unavailable via `status`. */
defineProps<{ status?: string; error?: string | null; busy?: boolean; actions?: FooterAction[] }>()
/** Phones keep one row (Back, primary): the secondary actions fold into a More menu. */
const compact = useMediaQuery('(max-width: 559px)')
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
      <Button v-if="hasRetry" type="button" size="sm" variant="outline" data-testid="footer-retry" @click="$emit('retry')">{{ t('create.actions.retry') }}</Button>
    </Alert>
    <div class="flex items-center gap-2.5 max-[559px]:flex-wrap max-[559px]:gap-x-2 max-[559px]:gap-y-2">
      <slot name="back" />
      <p
        role="status"
        class="min-w-0 flex-1 text-right leading-snug text-[12px] text-tx-a2b7c5 max-[559px]:order-first max-[559px]:basis-full max-[559px]:text-left max-[559px]:empty:sr-only"
      >
        <slot name="status">{{ status }}</slot>
      </p>
      <template v-if="actions?.length">
        <DropdownMenu v-if="compact">
          <DropdownMenuTrigger as-child>
            <Button type="button" variant="outline" class="size-11 flex-none p-0" :aria-label="t('create.wizard.footerMore')" data-testid="footer-more">
              <Ellipsis class="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" class="min-w-52">
            <DropdownMenuItem
              v-for="a in actions"
              :key="a.key"
              :disabled="a.disabled"
              :data-testid="`more-${a.key}`"
              :as-child="!!a.to"
              class="min-h-11 gap-2.5 text-[13px]"
              @select="a.onSelect?.()"
            >
              <RouterLink v-if="a.to" :to="a.to" class="flex min-h-11 w-full items-center gap-2.5"><component :is="a.icon" v-if="a.icon" class="size-4" aria-hidden="true" />{{ a.label }}</RouterLink>
              <template v-else>
                <component :is="a.icon" v-if="a.icon" class="size-4" aria-hidden="true" />{{ a.label }}
              </template>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <template v-else>
          <template v-for="a in actions" :key="a.key">
            <Button v-if="a.to && !a.disabled" as-child :variant="a.variant ?? 'ghost'">
              <RouterLink :to="a.to" :data-testid="a.testid"><component :is="a.icon" v-if="a.icon" class="size-4" aria-hidden="true" />{{ a.label }}</RouterLink>
            </Button>
            <Button
              v-else
              type="button"
              :variant="a.variant ?? 'ghost'"
              :class="a.link && 'underline decoration-white/25 underline-offset-[3px]'"
              :disabled="a.disabled"
              :data-testid="a.testid"
              @click="a.onSelect?.()"
            >
              <component :is="a.icon" v-if="a.icon" class="size-4" aria-hidden="true" />{{ a.label }}
            </Button>
          </template>
        </template>
      </template>
      <slot v-else name="secondary" />
      <div class="footer-primary"><slot name="primary" /></div>
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
  background: color-mix(in srgb, var(--workspace-bg) 84%, transparent);
  backdrop-filter: blur(18px) saturate(1.3);
  -webkit-backdrop-filter: blur(18px) saturate(1.3);
}
/* Desktop: the primary sits inline. Phone: it fills the row beside Back, at a thumb-sized height. */
.footer-primary { display: contents; }
@media (max-width: 559px) {
  .footer-primary { display: flex; flex: 1 1 0; min-width: 0; }
  .footer-primary > :deep(*) { flex: 1 1 auto; width: 100%; min-width: 0; min-height: 44px; height: auto; }
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
