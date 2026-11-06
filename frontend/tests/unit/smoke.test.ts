import { mount } from '@vue/test-utils'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

test('Button renders its slot text', () => {
  const wrapper = mount(Button, { slots: { default: 'Create' } })
  expect(wrapper.text()).toBe('Create')
  expect(wrapper.element.tagName).toBe('BUTTON')
})

test('cn merges and drops falsy classes', () => {
  expect(cn('a', false && 'b', 'c')).toBe('a c')
})
