<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { login, setup } from '@/api/auth'
import { ApiError } from '@/api/errors'
import { useSessionStore } from '@/stores/session'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const router = useRouter()
const session = useSessionStore()

const username = ref('')
const password = ref('')
const confirm = ref('')
const pending = ref(false)
const error = ref('')

// Mirrors the backend rules (AuthCredentialsRequest): username 3+ without spaces, password 8+.
const problem = computed(() => {
  const u = username.value.trim()
  if (u && (u.length < 3 || /\s/.test(u))) return 'Username must be at least 3 characters, with no spaces.'
  if (password.value && password.value.length < 8) return 'Password must be at least 8 characters.'
  if (confirm.value && confirm.value !== password.value) return 'Passwords do not match.'
  return ''
})
const canSubmit = computed(() => !!username.value.trim() && !!password.value && !!confirm.value && !problem.value)

async function submit() {
  if (pending.value || !canSubmit.value) return
  pending.value = true
  error.value = ''
  const name = username.value.trim()
  try {
    await setup(name, password.value)
    // The backend creates the account without signing in.
    session.applyStatus(await login(name, password.value))
    await router.push('/')
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : "Couldn't finish setup. Check your connection and try again."
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <main class="grid min-h-dvh place-items-center bg-rail px-5">
    <Card class="w-full max-w-sm">
      <CardHeader class="p-6 pb-4">
        <CardTitle class="font-display text-[22px] font-medium tracking-[-0.03em]">Welcome to Presenton</CardTitle>
        <CardDescription class="mt-1.5 text-[12px] text-muted">Create the administrator account for this workspace.</CardDescription>
      </CardHeader>
      <CardContent class="p-6 pt-0">
        <form class="flex flex-col gap-4" @submit.prevent="submit">
          <div class="flex flex-col gap-1.5">
            <Label for="setup-username" class="text-[11px] text-muted">Username</Label>
            <Input id="setup-username" v-model="username" autocomplete="username" required autofocus />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="setup-password" class="text-[11px] text-muted">Password</Label>
            <Input id="setup-password" v-model="password" type="password" autocomplete="new-password" required />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="setup-confirm" class="text-[11px] text-muted">Confirm password</Label>
            <Input id="setup-confirm" v-model="confirm" type="password" autocomplete="new-password" required />
          </div>
          <p v-if="problem" class="text-[11px] text-danger-text">{{ problem }}</p>
          <Alert v-if="error" variant="destructive" class="py-2 text-[12px]">{{ error }}</Alert>
          <Button type="submit" :disabled="pending || !canSubmit">{{ pending ? 'Creating account…' : 'Create account' }}</Button>
        </form>
      </CardContent>
    </Card>
  </main>
</template>
