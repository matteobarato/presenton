import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/api/errors'
import AccountSection from '@/components/settings/AccountSection.vue'
import { useSessionStore } from '@/stores/session'

const changePassword = vi.hoisted(() => vi.fn())
vi.mock('@/api/auth', () => ({ changePassword, getAuthStatus: vi.fn(), logout: vi.fn() }))
vi.mock('@/api/next-routes', () => ({ getRuntimeConfig: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('vue-sonner', () => ({ toast }))

let w: VueWrapper
const submit = () => w.get('[data-testid="change-password"] button[type="submit"]')

async function fill(current: string, next: string, confirm = next) {
  await w.get('#current-password').setValue(current)
  await w.get('#new-password').setValue(next)
  await w.get('#confirm-password').setValue(confirm)
}

beforeEach(() => {
  setActivePinia(createPinia())
  useSessionStore().user = { username: 'bob', role: 'user' }
  changePassword.mockReset()
  toast.success.mockReset()
  w = mount(AccountSection, { attachTo: document.body })
})
afterEach(() => {
  w.unmount()
  document.body.innerHTML = ''
})

describe('AccountSection change password', () => {
  it('validates length, sameness and confirmation before enabling submit', async () => {
    expect(submit().attributes('disabled')).toBeDefined()
    await fill('oldpass12', 'short')
    expect(w.text()).toContain('at least 8 characters')
    await fill('oldpass12', 'oldpass12')
    expect(w.text()).toContain('different from the current one')
    await fill('oldpass12', 'newpass123', 'newpass124')
    expect(w.text()).toContain('do not match')
    await fill('oldpass12', 'newpass123')
    expect(submit().attributes('disabled')).toBeUndefined()
  })

  it('changes the password and clears the form', async () => {
    changePassword.mockResolvedValue(undefined)
    await fill('oldpass12', 'newpass123')
    await w.get('[data-testid="change-password"]').trigger('submit')
    await flushPromises()
    expect(changePassword).toHaveBeenCalledWith('oldpass12', 'newpass123')
    expect(toast.success).toHaveBeenCalled()
    expect((w.get('#current-password').element as HTMLInputElement).value).toBe('')
  })

  it('shows the backend message for a wrong current password', async () => {
    changePassword.mockRejectedValue(new ApiError('Current password is incorrect', 400, {}))
    await fill('wrongpass', 'newpass123')
    await w.get('[data-testid="change-password"]').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('Current password is incorrect')
    expect((w.get('#new-password').element as HTMLInputElement).value).toBe('newpass123')
  })
})
