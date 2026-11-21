import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { inject, onBeforeUnmount, provide, ref, type InjectionKey, type Ref } from 'vue'

/** A secondary footer action: a button (or link) beside the primary on wide screens, an item in the More menu on phones. */
export interface FooterAction {
  key: string
  label: string
  icon?: Component
  to?: RouteLocationRaw
  onSelect?: () => void
  disabled?: boolean
  variant?: 'ghost' | 'outline'
  /** Quiet text-link look (e.g. Skip to Export). */
  link?: boolean
  testid?: string
}

/**
 * Lets the open step render the wizard's one footer. The wizard provides an element to teleport into; a
 * step that claims it hides the wizard's generic Back/Next footer for as long as it is mounted.
 */
export interface WizardFooterHost {
  target: Ref<HTMLElement | null>
  claims: Ref<number>
  /** False while the wizard shows something over the step (a summary): the step's footer then stays off screen. */
  active: Ref<boolean>
  /** Why the user just hit a locked step or action; shown in the footer's status line for a few seconds. */
  notice: Ref<string>
  /** The wizard's Back action, for steps that keep it in their own footer. */
  back: { available: Ref<boolean>; go: () => void }
}

const KEY: InjectionKey<WizardFooterHost> = Symbol('wizard-footer')

export function provideWizardFooter(back: WizardFooterHost['back'], active: Ref<boolean>, notice: Ref<string>): WizardFooterHost {
  const host: WizardFooterHost = { target: ref(null), claims: ref(0), active, back, notice }
  provide(KEY, host)
  return host
}

/** Claims the footer for the calling step. Null outside a wizard: the step renders its footer in place. */
export function claimWizardFooter(): WizardFooterHost | null {
  const host = inject(KEY, null)
  if (!host) return null
  host.claims.value++
  onBeforeUnmount(() => host.claims.value--)
  return host
}

/**
 * A short-lived line for the footer's status: why a locked step can't be opened. Replaces itself on the next
 * call and clears after `ms`, or when `clear()` runs (e.g. on a step change).
 */
export function useFooterNotice(ms = 7000) {
  const text = ref('')
  let timer: ReturnType<typeof setTimeout> | undefined
  const clear = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    text.value = ''
  }
  const show = (message: string) => {
    clear()
    text.value = message
    timer = setTimeout(clear, ms)
  }
  onBeforeUnmount(clear)
  return { text, show, clear }
}
