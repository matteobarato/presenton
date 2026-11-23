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
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
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
  if (u && (u.length < 3 || /\s/.test(u))) return t('views.setup.usernameRule')
  if (password.value && password.value.length < 8) return t('views.setup.passwordRule')
  if (confirm.value && confirm.value !== password.value) return t('views.setup.passwordMismatch')
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
    error.value = e instanceof ApiError ? e.message : t('views.setup.failed')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <main class="grid min-h-dvh place-items-center bg-rail px-5">
    <Card class="w-full max-w-sm">
      <CardHeader class="p-6 pb-4">
        <CardTitle class="font-display text-[22px] font-medium tracking-[-0.03em]">{{ t('views.setup.title') }}</CardTitle>
        <CardDescription class="mt-1.5 text-[12px] text-muted">{{ t('views.setup.description') }}</CardDescription>
      </CardHeader>
      <CardContent class="p-6 pt-0">
        <form class="flex flex-col gap-4" @submit.prevent="submit">
          <div class="flex flex-col gap-1.5">
            <Label for="setup-username" class="text-[11px] text-muted">{{ t('views.setup.username') }}</Label>
            <Input id="setup-username" v-model="username" autocomplete="username" required autofocus />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="setup-password" class="text-[11px] text-muted">{{ t('views.setup.password') }}</Label>
            <Input id="setup-password" v-model="password" type="password" autocomplete="new-password" required />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="setup-confirm" class="text-[11px] text-muted">{{ t('views.setup.confirm') }}</Label>
            <Input id="setup-confirm" v-model="confirm" type="password" autocomplete="new-password" required />
          </div>
          <p v-if="problem" class="text-[11px] text-danger-text">{{ problem }}</p>
          <Alert v-if="error" variant="destructive" class="py-2 text-[12px]">{{ error }}</Alert>
          <Button type="submit" :disabled="pending || !canSubmit">{{ pending ? t('views.setup.submitting') : t('views.setup.submit') }}</Button>
        </form>
      </CardContent>
    </Card>
  </main>
</template>
