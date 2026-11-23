import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import WizardSteps from '@/components/create/wizard/WizardSteps.vue'
import WizardFooter from '@/components/create/wizard/WizardFooter.vue'
import WizardLayout from '@/components/create/wizard/WizardLayout.vue'
import { WIZARD_STEPS, type StepState, type WizardStepItem } from '@/components/create/wizard/progress'

function items(over: Partial<Record<string, Partial<WizardStepItem>>> = {}): WizardStepItem[] {
  return WIZARD_STEPS.map((s) => ({
    ...s,
    state: 'available' as StepState,
    reason: null,
    summary: '',
    ...over[s.key],
  }))
}

describe('WizardSteps', () => {
  it('locked step is not selectable', async () => {
    const w = mount(WizardSteps, {
      props: { items: items({ preview: { state: 'locked', reason: 'Generate slides first' } }), current: 'topic' },
    })
    const b = w.get('[data-testid="step-preview"]')
    expect(b.attributes('aria-disabled')).toBe('true')
    expect(b.attributes('title')).toBe('Generate slides first')
    // The reason reaches screen readers too, not only the hover title.
    const reason = w.get(`#${b.attributes('aria-describedby')}`)
    expect(reason.text()).toBe('Generate slides first')
    expect(reason.classes()).toContain('sr-only')
    await b.trigger('click')
    expect(w.emitted('select')).toBeUndefined()
  })

  it('done step shows check and is selectable', async () => {
    const w = mount(WizardSteps, { props: { items: items({ topic: { state: 'done' } }), current: 'outline' } })
    const b = w.get('[data-testid="step-topic"]')
    expect(b.find('[data-icon="check"]').exists()).toBe(true)
    expect(b.get('[data-testid="step-topic-state"]').text()).toBe('(Completed)')
    expect(w.get('[data-testid="step-outline"]').find('[data-testid="step-outline-state"]').exists()).toBe(false)
    expect(w.get('[data-testid="step-outline"]').attributes('aria-describedby')).toBeUndefined()
    await b.trigger('click')
    expect(w.emitted('select')).toEqual([['topic']])
  })

  it('running step shows spinner', () => {
    const w = mount(WizardSteps, { props: { items: items({ outline: { state: 'running' } }), current: 'outline' } })
    expect(w.get('[data-testid="step-outline"]').find('[data-icon="spinner"]').exists()).toBe(true)
    expect(w.get('[data-testid="step-outline-state"]').text()).toBe('(In progress)')
  })

  it('marks current, renders the summary, and a compact bar', () => {
    const w = mount(WizardSteps, {
      props: { items: items({ avatar: { summary: '3 of 5 narrated' } }), current: 'preview' },
    })
    expect(w.get('[data-testid="step-preview"]').attributes('aria-current')).toBe('step')
    expect(w.get('[data-testid="step-avatar"]').text()).toContain('3 of 5 narrated')
    expect(w.get('[data-testid="steps-compact"]').text()).toContain('4/6')
    expect(w.findAll('ol > li')).toHaveLength(6)
  })
})

describe('WizardSteps styling', () => {
  it('only the current tile is underlined; done is tinted; connectors follow done state', () => {
    const w = mount(WizardSteps, {
      props: { items: items({ topic: { state: 'done' }, presenter: { state: 'done' } }), current: 'outline' },
    })
    expect(w.findAll('[data-testid="step-underline"]')).toHaveLength(1)
    expect(w.find('[data-testid="step-outline"] [data-testid="step-underline"]').exists()).toBe(true)
    expect(w.get('[data-testid="step-topic"] [data-icon="check"]').element.parentElement!.className).toContain('text-accent')
    expect(w.get('[data-testid="step-link-presenter"]').classes()).toContain('bg-accent/65')
    expect(w.get('[data-testid="step-link-outline"]').classes()).toContain('bg-accent/65')
    expect(w.get('[data-testid="step-link-preview"]').classes()).toContain('bg-ov/[0.1]')
  })
})

describe('WizardFooter', () => {
  it('shows status as live region', () => {
    const w = mount(WizardFooter, { props: { status: 'Slides must finish generating first' } })
    expect(w.get('[role="status"]').text()).toBe('Slides must finish generating first')
  })

  it('retry emits', async () => {
    const w = mount(WizardFooter, { props: { error: 'Boom' }, attrs: { onRetry: () => {} } })
    expect(w.text()).toContain('Boom')
    await w.get('[data-testid="footer-retry"]').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
  })

  it('no retry button without a listener', () => {
    const w = mount(WizardFooter, { props: { error: 'Boom' } })
    expect(w.find('[data-testid="footer-retry"]').exists()).toBe(false)
  })
})

describe('WizardLayout', () => {
  async function mountLayout() {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
    await router.push('/')
    return mount(WizardLayout, {
      props: { title: 'New presentation', heading: 'Heading', lede: 'Lede', items: items(), current: 'topic' as const },
      slots: { default: '<input id="x" />', footer: '<span data-testid="ft" />' },
      global: { plugins: [router] },
      attachTo: document.body,
    })
  }

  it('focuses heading on step change', async () => {
    const w = await mountLayout()
    await w.setProps({ current: 'outline' })
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(w.get('h2').element)
    expect(w.get('h2').attributes('tabindex')).toBe('-1')
    expect(w.find('[data-testid="ft"]').exists()).toBe(true)
    w.unmount()
  })

  it('alt+arrow emits navigate', async () => {
    const w = await mountLayout()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true }))
    expect(w.emitted('navigate')).toEqual([['next'], ['back']])
    w.unmount()
  })

  it('ignores alt+arrow while typing', async () => {
    const w = await mountLayout()
    const input = w.get('#x').element as HTMLInputElement
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }))
    expect(w.emitted('navigate')).toBeUndefined()
    w.unmount()
  })

  it('re-emits select from the steps', async () => {
    const w = await mountLayout()
    await w.get('[data-testid="step-outline"]').trigger('click')
    expect(w.emitted('select')).toEqual([['outline']])
    w.unmount()
  })
})
