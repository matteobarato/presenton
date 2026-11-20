import { inject, onBeforeUnmount, provide, ref, type InjectionKey, type Ref } from 'vue'

/**
 * Lets the open step render the wizard's one footer. The wizard provides an element to teleport into; a
 * step that claims it hides the wizard's generic Back/Next footer for as long as it is mounted.
 */
export interface WizardFooterHost {
  target: Ref<HTMLElement | null>
  claims: Ref<number>
  /** False while the wizard shows something over the step (a summary): the step's footer then stays off screen. */
  active: Ref<boolean>
  /** The wizard's Back action, for steps that keep it in their own footer. */
  back: { available: Ref<boolean>; go: () => void }
}

const KEY: InjectionKey<WizardFooterHost> = Symbol('wizard-footer')

export function provideWizardFooter(back: WizardFooterHost['back'], active: Ref<boolean>): WizardFooterHost {
  const host: WizardFooterHost = { target: ref(null), claims: ref(0), active, back }
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
