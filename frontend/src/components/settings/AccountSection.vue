<script setup lang="ts">
import { computed, ref } from 'vue'
import { Loader2, LockKeyhole, LogOut, ShieldCheck, UserRound } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { changePassword } from '@/api/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
// Signing out is the parent's job: it owns the unsaved-changes prompt that must run first.
const emit = defineEmits<{ 'sign-out': [] }>()

// Mirrors `ChangePasswordRequest` in servers/fastapi/api/v1/auth/schemas.py.
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128

const current = ref('')
const next = ref('')
const confirm = ref('')
const saving = ref(false)
const error = ref('')

const problem = computed(() => {
  if (!current.value) return 'Enter your current password.'
  if (next.value.length < PASSWORD_MIN) return `The new password must be at least ${PASSWORD_MIN} characters.`
  if (next.value.length > PASSWORD_MAX) return `The new password must be at most ${PASSWORD_MAX} characters.`
  if (next.value === current.value) return 'The new password must be different from the current one.'
  if (confirm.value !== next.value) return 'The new passwords do not match.'
  return ''
})
const initial = computed(() => (session.user?.username ?? '?').charAt(0).toUpperCase())
const isAdmin = computed(() => session.user?.role === 'admin')
const touched = computed(() => Boolean(current.value || next.value || confirm.value))

async function onSubmit() {
  if (problem.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await changePassword(current.value, next.value)
    current.value = next.value = confirm.value = ''
    toast.success('Password changed', { description: 'Your other sessions were signed out.' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'The password could not be changed.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="grid gap-8">
    <div class="flex items-center justify-between gap-4 rounded-[11px] bg-[#1d2427] px-4 py-4 max-[450px]:flex-col max-[450px]:items-start">
      <div class="flex min-w-0 items-center gap-3.5">
        <span
          class="grid size-11 flex-none place-items-center rounded-full border-[3px] border-[#2e2b28] bg-[#ddccb9] text-[15px] font-bold text-[#493c2e]"
          aria-hidden="true"
        >{{ initial }}</span>
        <dl class="min-w-0">
          <dt class="sr-only">Username</dt>
          <dd class="flex items-center gap-1.5 truncate text-[14px] font-medium text-[#e4ecf0]">
            <UserRound class="size-3.5 flex-none stroke-[1.75] text-[#95aab7]" aria-hidden="true" />
            {{ session.user?.username }}
          </dd>
          <template v-if="session.user?.role">
            <dt class="sr-only">Role</dt>
            <dd class="mt-1 flex items-center gap-1.5 text-[11px] text-[#95aab7]">
              <ShieldCheck v-if="isAdmin" class="size-3.5 flex-none stroke-[1.75] text-[#c2e5f5]" aria-hidden="true" />
              <UserRound v-else class="size-3.5 flex-none stroke-[1.75]" aria-hidden="true" />
              {{ isAdmin ? 'Administrator' : 'Member' }}
            </dd>
          </template>
        </dl>
      </div>
      <Button variant="secondary" @click="emit('sign-out')"><LogOut class="size-3.5" aria-hidden="true" />Sign out</Button>
    </div>

    <form
      v-if="!session.user?.authDisabled"
      class="grid gap-4 rounded-[11px] bg-[#1d2427] p-4"
      novalidate
      data-testid="change-password"
      @submit.prevent="onSubmit"
    >
      <div class="flex items-start gap-3">
        <span class="grid size-8 flex-none place-items-center rounded-[9px] bg-[#c2e5f5]/12 text-[#c2e5f5]" aria-hidden="true">
          <LockKeyhole class="size-4 stroke-[1.75]" />
        </span>
        <div>
          <h3 class="text-[13px] font-medium text-[#dbe7ef]">Change password</h3>
          <p class="mt-1 text-[11px] text-[#95aab7]">You stay signed in here; every other session is signed out.</p>
        </div>
      </div>
      <!-- Lets password managers pair the new password with this account. -->
      <input type="text" name="username" autocomplete="username" :value="session.user?.username ?? ''" hidden readonly />
      <div class="min-w-0">
        <label for="current-password" class="mb-2 block text-[12px] font-medium text-[#dbe7ef]">Current password</label>
        <Input id="current-password" v-model="current" type="password" autocomplete="current-password" :maxlength="PASSWORD_MAX" />
      </div>
      <div class="grid grid-cols-2 gap-3 max-[760px]:grid-cols-1">
        <div class="min-w-0">
          <label for="new-password" class="mb-2 block text-[12px] font-medium text-[#dbe7ef]">New password</label>
          <Input id="new-password" v-model="next" type="password" autocomplete="new-password" :maxlength="PASSWORD_MAX" />
        </div>
        <div class="min-w-0">
          <label for="confirm-password" class="mb-2 block text-[12px] font-medium text-[#dbe7ef]">Confirm new password</label>
          <Input id="confirm-password" v-model="confirm" type="password" autocomplete="new-password" :maxlength="PASSWORD_MAX" />
        </div>
      </div>
      <div class="flex items-center justify-between gap-3">
        <p class="text-[11px]" :class="error ? 'text-danger-text' : 'text-[#95aab7]'" role="status" aria-live="polite">
          {{ error || (touched ? problem : `At least ${PASSWORD_MIN} characters.`) }}
        </p>
        <Button type="submit" :disabled="Boolean(problem) || saving">
          <Loader2 v-if="saving" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Change password
        </Button>
      </div>
    </form>
  </div>
</template>
