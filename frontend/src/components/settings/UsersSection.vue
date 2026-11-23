<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { KeyRound, Loader2, RefreshCw, ShieldCheck, Trash2, UserPlus } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { createUser, deleteUser, listUsers, resetUserPassword, type AdminUser } from '@/api/admin'
import { ApiError } from '@/api/errors'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/settings/adminFormat'

// Mirrors `AuthCredentialsRequest` / `AdminResetPasswordRequest` in servers/fastapi/api/v1/auth/schemas.py.
const USERNAME_MIN = 3
const USERNAME_MAX = 128
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128

const users = ref<AdminUser[]>([])
const loading = ref(true)
const loadError = ref('')

const username = ref('')
const password = ref('')
const creating = ref(false)

const resetTarget = ref<AdminUser | null>(null)
const resetPassword = ref('')
const resetting = ref(false)

const deleteTarget = ref<AdminUser | null>(null)
const deleting = ref(false)

const message = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message : fallback)

function usernameProblem(value: string): string {
  const v = value.trim()
  if (v.length < USERNAME_MIN) return `Username must be at least ${USERNAME_MIN} characters.`
  if (v.length > USERNAME_MAX) return `Username must be at most ${USERNAME_MAX} characters.`
  if (/\s/.test(v)) return 'Username cannot contain spaces.'
  return ''
}
function passwordProblem(value: string): string {
  if (value.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`
  if (value.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters.`
  return ''
}

const createProblem = computed(() => usernameProblem(username.value) || passwordProblem(password.value))
const resetProblem = computed(() => passwordProblem(resetPassword.value))

async function load() {
  loading.value = true
  try {
    users.value = await listUsers()
    loadError.value = ''
  } catch (e) {
    loadError.value = message(e, 'The accounts could not be loaded.')
  } finally {
    loading.value = false
  }
}

async function onCreate() {
  if (createProblem.value || creating.value) return
  creating.value = true
  try {
    const user = await createUser(username.value.trim(), password.value)
    users.value = [user, ...users.value]
    username.value = ''
    password.value = ''
    toast.success(`Added ${user.username}`)
  } catch (e) {
    toast.error('Could not add user', { description: message(e, 'Please try again.') })
  } finally {
    creating.value = false
  }
}

function openReset(user: AdminUser) {
  resetPassword.value = ''
  resetTarget.value = user
}

async function onReset() {
  const user = resetTarget.value
  if (!user || resetProblem.value || resetting.value) return
  resetting.value = true
  try {
    await resetUserPassword(user.id, resetPassword.value)
    toast.success(`Password reset for ${user.username}`, { description: 'Their existing sessions were signed out.' })
    resetTarget.value = null
    resetPassword.value = ''
  } catch (e) {
    toast.error('Could not reset password', { description: message(e, 'Please try again.') })
  } finally {
    resetting.value = false
  }
}

async function onDelete() {
  const user = deleteTarget.value
  if (!user || deleting.value) return
  deleting.value = true
  try {
    await deleteUser(user.id)
    users.value = users.value.filter((u) => u.id !== user.id)
    toast.success(`Deleted ${user.username}`)
    deleteTarget.value = null
  } catch (e) {
    toast.error('Could not delete user', { description: message(e, 'Please try again.') })
  } finally {
    deleting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="grid gap-8">
    <form class="grid gap-4 rounded-[11px] bg-sx-1d2427 p-4" novalidate @submit.prevent="onCreate">
      <div class="flex items-start gap-3">
        <span class="grid size-8 flex-none place-items-center rounded-[9px] bg-sx-c2e5f5/12 text-tx-c2e5f5" aria-hidden="true">
          <UserPlus class="size-4 stroke-[1.75]" />
        </span>
        <div>
          <h3 class="text-[13px] font-medium text-tx-dbe7ef">Add user</h3>
          <p class="mt-1 text-[11px] text-tx-95aab7">New accounts sign in with a username and password. They see their own decks only.</p>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3 max-[760px]:grid-cols-1">
        <div class="min-w-0">
          <label for="new-user-username" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">Username</label>
          <Input id="new-user-username" v-model="username" autocomplete="off" autocapitalize="off" spellcheck="false" :maxlength="USERNAME_MAX" />
        </div>
        <div class="min-w-0">
          <label for="new-user-password" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">Password</label>
          <Input id="new-user-password" v-model="password" type="password" autocomplete="new-password" :maxlength="PASSWORD_MAX" />
        </div>
      </div>
      <div class="flex items-center justify-between gap-3">
        <p class="text-[11px] text-tx-95aab7" aria-live="polite">
          {{ username || password ? createProblem : `At least ${PASSWORD_MIN} characters for the password.` }}
        </p>
        <Button type="submit" :disabled="Boolean(createProblem) || creating">
          <Loader2 v-if="creating" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <UserPlus v-else class="size-3.5" aria-hidden="true" />
          Add user
        </Button>
      </div>
    </form>

    <section aria-labelledby="accounts-heading">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 id="accounts-heading" class="text-[13px] font-medium text-tx-dbe7ef">Accounts</h3>
          <p v-if="!loading && !loadError" class="mt-1 text-[11px] text-tx-95aab7">
            {{ users.length }} {{ users.length === 1 ? 'account' : 'accounts' }}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Refresh accounts" :disabled="loading" @click="load">
          <RefreshCw class="size-4" :class="loading ? 'animate-spin motion-reduce:animate-none' : ''" aria-hidden="true" />
        </Button>
      </div>

      <div v-if="loading && !users.length" class="grid gap-2" aria-busy="true">
        <Skeleton v-for="n in 3" :key="n" class="h-[58px] rounded-[11px]" />
      </div>
      <Alert v-else-if="loadError" variant="destructive" class="flex items-center justify-between gap-4 py-2 text-[12px]">
        <span>{{ loadError }}</span>
        <Button variant="secondary" size="sm" @click="load">Retry</Button>
      </Alert>
      <ul v-else class="grid gap-2" data-testid="user-list">
        <li
          v-for="user in users"
          :key="user.id"
          class="flex items-center justify-between gap-3 rounded-[11px] bg-sx-1d2427 px-4 py-3"
          data-testid="user-row"
        >
          <div class="flex min-w-0 items-center gap-3">
            <span
              class="grid size-9 flex-none place-items-center rounded-full border-[3px] border-lx-2e2b28 bg-sx-ddccb9 text-[12px] font-bold text-tx-493c2e"
              aria-hidden="true"
            >{{ user.username.charAt(0).toUpperCase() }}</span>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="truncate text-[13px] font-medium text-tx-dbe7ef">{{ user.username }}</span>
                <Badge :variant="user.role === 'admin' ? 'default' : 'secondary'">
                  <ShieldCheck v-if="user.role === 'admin'" class="size-3" aria-hidden="true" />
                  {{ user.role === 'admin' ? 'Admin' : 'User' }}
                </Badge>
              </div>
              <p class="mt-1 text-[10px] text-tx-95aab7">{{ user.created_at ? `Added ${formatDate(user.created_at)}` : 'Added at setup' }}</p>
            </div>
          </div>
          <div v-if="user.role !== 'admin'" class="flex flex-none items-center gap-1">
            <Button variant="ghost" size="icon" :aria-label="`Reset password for ${user.username}`" @click="openReset(user)">
              <KeyRound class="size-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" :aria-label="`Delete ${user.username}`" @click="deleteTarget = user">
              <Trash2 class="size-4" aria-hidden="true" />
            </Button>
          </div>
          <p v-else class="flex-none text-[10px] text-tx-95aab7">Managed by deployment</p>
        </li>
      </ul>
    </section>

    <Dialog :open="resetTarget !== null" @update:open="(open) => { if (!open && !resetting) resetTarget = null }">
      <DialogContent class="w-[min(440px,calc(100vw-32px))]">
        <form novalidate @submit.prevent="onReset">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>Set a new password for {{ resetTarget?.username }}. They will be signed out everywhere.</DialogDescription>
          </DialogHeader>
          <div class="mt-5">
            <label for="reset-password" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">New password</label>
            <Input id="reset-password" v-model="resetPassword" type="password" autocomplete="new-password" :maxlength="PASSWORD_MAX" />
            <p class="mt-2 text-[11px] text-tx-95aab7" aria-live="polite">{{ resetPassword ? resetProblem : `At least ${PASSWORD_MIN} characters.` }}</p>
          </div>
          <DialogFooter class="mt-6">
            <Button type="button" variant="ghost" :disabled="resetting" @click="resetTarget = null">Cancel</Button>
            <Button type="submit" :disabled="Boolean(resetProblem) || resetting">
              <Loader2 v-if="resetting" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog :open="deleteTarget !== null" @update:open="(open) => { if (!open && !deleting) deleteTarget = null }">
      <DialogContent class="w-[min(440px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>Delete {{ deleteTarget?.username }}?</DialogTitle>
          <DialogDescription>
            Their presentations, uploads, exports and API keys are removed permanently. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="mt-6">
          <Button variant="ghost" :disabled="deleting" @click="deleteTarget = null">Cancel</Button>
          <Button variant="destructive" :disabled="deleting" @click="onDelete">
            <Loader2 v-if="deleting" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Delete user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
