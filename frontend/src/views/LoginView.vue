<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { login } from '@/api/auth'
import { ApiError } from '@/api/errors'
import { safeNext } from '@/lib/safe-next'
import { useSessionStore } from '@/stores/session'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const username = ref('')
const password = ref('')
const pending = ref(false)
const error = ref('')

async function submit() {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    session.applyStatus(await login(username.value.trim(), password.value))
    await router.push(safeNext(route.query.next))
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : "Couldn't sign in. Check your connection and try again."
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <main class="grid min-h-dvh place-items-center bg-rail px-5">
    <Card class="w-full max-w-sm">
      <CardHeader class="p-6 pb-4">
        <CardTitle class="font-display text-[22px] font-medium tracking-[-0.03em]">Sign in to Presenton</CardTitle>
        <CardDescription class="mt-1.5 text-[12px] text-muted">Use the account you created during setup.</CardDescription>
      </CardHeader>
      <CardContent class="p-6 pt-0">
        <form class="flex flex-col gap-4" @submit.prevent="submit">
          <div class="flex flex-col gap-1.5">
            <Label for="login-username" class="text-[11px] text-muted">Username</Label>
            <Input id="login-username" v-model="username" autocomplete="username" required autofocus />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="login-password" class="text-[11px] text-muted">Password</Label>
            <Input id="login-password" v-model="password" type="password" autocomplete="current-password" required />
          </div>
          <Alert v-if="error" variant="destructive" class="py-2 text-[12px]">{{ error }}</Alert>
          <Button type="submit" :disabled="pending">{{ pending ? 'Signing in…' : 'Sign in' }}</Button>
        </form>
      </CardContent>
    </Card>
  </main>
</template>
