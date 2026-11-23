<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Copy, Eye, EyeOff, KeyRound, Loader2, Plus, RefreshCw, ShieldOff } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import {
  apiKeyStatus,
  createApiKey,
  createMyApiKey,
  listApiKeys,
  listMyApiKeys,
  listUsers,
  revealApiKey,
  revealMyApiKey,
  revokeApiKey,
  revokeMyApiKey,
  type AdminUser,
  type ApiKey,
  type ApiKeyCreated,
} from '@/api/admin'
import { ApiError } from '@/api/errors'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/settings/adminFormat'
import { useSessionStore } from '@/stores/session'

/**
 * `all`: an admin manages every user's keys and picks who a new key acts as.
 * `mine`: anyone manages their own keys, which always act as themselves.
 */
const props = withDefaults(defineProps<{ scope?: 'all' | 'mine' }>(), { scope: 'all' })

// Mirrors `AdminCreateApiKeyRequest` / `PersonalCreateApiKeyRequest` in servers/fastapi/api/v1/auth/schemas.py.
const LABEL_MAX = 120
const EXPIRY_MIN = 1
const EXPIRY_MAX = 365
const EXPIRY_PRESETS = [30, 90, 180, 365]

const { t } = useI18n()
const session = useSessionStore()
const personal = computed(() => props.scope === 'mine')

const users = ref<AdminUser[]>([])
const keys = ref<ApiKey[]>([])
const loading = ref(true)
const loadError = ref('')

const form = reactive({ userId: '', label: 'API client', expiryDays: '90' })
const creating = ref(false)
const created = ref<{ label: string; token: string } | null>(null)

// Revealed secrets live only in this component and are dropped on unmount.
const tokens = reactive<Record<string, string>>({})
const visible = reactive(new Set<string>())
const busyKey = ref<string | null>(null)

const revokeTarget = ref<ApiKey | null>(null)
const revoking = ref(false)

const message = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message : fallback)

const usernames = computed(() => new Map(users.value.map((u) => [u.id, u.username])))
const ownerName = (id: string) => usernames.value.get(id) ?? t('settings.apiKeys.deletedUser')

const formProblem = computed(() => {
  if (!personal.value && !form.userId) return t('settings.apiKeys.validation.chooseUser')
  const label = form.label.trim()
  if (!label) return t('settings.apiKeys.validation.giveLabel')
  if (label.length > LABEL_MAX) return t('settings.apiKeys.validation.labelMax', { max: LABEL_MAX })
  const days = Number(form.expiryDays)
  if (!Number.isInteger(days) || days < EXPIRY_MIN || days > EXPIRY_MAX) return t('settings.apiKeys.validation.expiry', { min: EXPIRY_MIN, max: EXPIRY_MAX })
  return ''
})

async function load() {
  loading.value = true
  try {
    if (personal.value) {
      keys.value = await listMyApiKeys()
    } else {
      const [u, k] = await Promise.all([listUsers(), listApiKeys()])
      users.value = u
      keys.value = k
      if (!form.userId || !u.some((x) => x.id === form.userId)) form.userId = u.find((x) => x.role === 'admin')?.id ?? u[0]?.id ?? ''
    }
    loadError.value = ''
  } catch (e) {
    // A 404 on the list means "nothing to show" (e.g. an older backend without self-service keys),
    // not a failure: show the empty state instead of a red "Not Found".
    if (e instanceof ApiError && e.status === 404) {
      keys.value = []
      loadError.value = ''
    } else {
      loadError.value = message(e, t('settings.apiKeys.loadFailed'))
    }
  } finally {
    loading.value = false
  }
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    toast.error(t('settings.apiKeys.copyFailed'), { description: t('settings.apiKeys.copyFailedDescription') })
    return false
  }
}

async function onCreate() {
  if (formProblem.value || creating.value) return
  creating.value = true
  try {
    const input = { label: form.label.trim(), expiryDays: Number(form.expiryDays) }
    const key: ApiKeyCreated = personal.value ? await createMyApiKey(input) : await createApiKey({ ...input, userId: form.userId })
    const { token, ...rest } = key
    keys.value = [rest, ...keys.value]
    tokens[key.id] = token
    created.value = { label: key.label, token }
    form.label = 'API client'
  } catch (e) {
    toast.error(t('settings.apiKeys.createFailed'), { description: message(e, t('settings.shared.tryAgain')) })
  } finally {
    creating.value = false
  }
}

async function tokenFor(key: ApiKey): Promise<string | null> {
  if (tokens[key.id]) return tokens[key.id]!
  busyKey.value = key.id
  try {
    const token = personal.value ? await revealMyApiKey(key.id) : await revealApiKey(key.id)
    tokens[key.id] = token
    return token
  } catch (e) {
    const detail =
      e instanceof ApiError && e.status === 409
        ? t('settings.apiKeys.revealLegacy')
        : e instanceof ApiError && e.status === 410
          ? t('settings.apiKeys.revealRevoked')
          : message(e, t('settings.shared.tryAgain'))
    toast.error(t('settings.apiKeys.revealFailed'), { description: detail })
    if (e instanceof ApiError && e.status === 410) void load()
    return null
  } finally {
    busyKey.value = null
  }
}

async function toggle(key: ApiKey) {
  if (visible.has(key.id)) {
    visible.delete(key.id)
    return
  }
  if (await tokenFor(key)) visible.add(key.id)
}

async function onCopy(key: ApiKey) {
  const token = await tokenFor(key)
  if (token && (await copy(token))) toast.success(t('settings.apiKeys.copiedKey', { label: key.label }))
}

async function onCopyCreated() {
  if (created.value && (await copy(created.value.token))) toast.success(t('settings.apiKeys.copied'))
}

async function onRevoke() {
  const key = revokeTarget.value
  if (!key || revoking.value) return
  revoking.value = true
  try {
    const updated = personal.value ? await revokeMyApiKey(key.id) : await revokeApiKey(key.id)
    keys.value = keys.value.map((k) => (k.id === updated.id ? updated : k))
    delete tokens[key.id]
    visible.delete(key.id)
    toast.success(t('settings.apiKeys.revokedKey', { label: key.label }))
    revokeTarget.value = null
  } catch (e) {
    toast.error(t('settings.apiKeys.revokeFailed'), { description: message(e, t('settings.shared.tryAgain')) })
  } finally {
    revoking.value = false
  }
}

onMounted(load)
onBeforeUnmount(() => {
  for (const id of Object.keys(tokens)) delete tokens[id]
  visible.clear()
  created.value = null
})
</script>

<template>
  <div class="grid gap-8">
    <form class="grid gap-4 rounded-[11px] bg-sx-1d2427 p-4" novalidate @submit.prevent="onCreate">
      <div class="flex items-start gap-3">
        <span class="grid size-8 flex-none place-items-center rounded-[9px] bg-sx-c2e5f5/12 text-tx-c2e5f5" aria-hidden="true">
          <KeyRound class="size-4 stroke-[1.75]" />
        </span>
        <div>
          <h3 class="text-[13px] font-medium text-tx-dbe7ef">{{ t('settings.apiKeys.createTitle') }}</h3>
          <p v-if="personal" class="mt-1 text-[11px] text-tx-95aab7" data-testid="acts-as-you">
            {{ t('settings.apiKeys.personal.actsAs') }} <span class="text-tx-dbe7ef">{{ session.user?.username }}</span>{{ t('settings.apiKeys.personal.reach') }}
            {{ t('settings.apiKeys.personal.sendOne') }} <code class="text-tx-c2e5f5">Authorization: Bearer &lt;key&gt;</code>.
          </p>
          <p v-else class="mt-1 text-[11px] text-tx-95aab7">
            {{ t('settings.apiKeys.intro') }}
            <code class="text-tx-c2e5f5">Authorization: Bearer &lt;key&gt;</code>.
          </p>
        </div>
      </div>
      <div
        class="grid gap-3 max-[760px]:grid-cols-1"
        :class="personal ? 'grid-cols-[1fr_140px]' : 'grid-cols-[1fr_1fr_140px] max-[1050px]:grid-cols-2'"
      >
        <div v-if="!personal" class="min-w-0">
          <label for="api-key-user" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ t('settings.apiKeys.actsAs') }}</label>
          <Select v-model="form.userId" :disabled="loading || !users.length">
            <SelectTrigger id="api-key-user" data-testid="api-key-user">
              <SelectValue :placeholder="t('settings.apiKeys.choosePlaceholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="u in users" :key="u.id" :value="u.id">
                {{ u.role === 'admin' ? t('settings.apiKeys.adminUser', { name: u.username }) : u.username }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="min-w-0">
          <label for="api-key-label" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ t('settings.apiKeys.label') }}</label>
          <Input id="api-key-label" v-model="form.label" autocomplete="off" :maxlength="LABEL_MAX" :placeholder="t('settings.apiKeys.labelPlaceholder')" />
        </div>
        <div class="min-w-0">
          <label for="api-key-expiry" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ t('settings.apiKeys.expiresAfter') }}</label>
          <Select v-model="form.expiryDays">
            <SelectTrigger id="api-key-expiry" data-testid="api-key-expiry">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="d in EXPIRY_PRESETS" :key="d" :value="String(d)">{{ t('settings.apiKeys.days', d) }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div class="flex items-center justify-between gap-3">
        <p class="text-[11px] text-tx-95aab7" aria-live="polite">{{ loading ? '' : formProblem }}</p>
        <Button type="submit" :disabled="Boolean(formProblem) || creating || loading">
          <Loader2 v-if="creating" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <Plus v-else class="size-3.5" aria-hidden="true" />
          {{ t('settings.apiKeys.createButton') }}
        </Button>
      </div>
    </form>

    <section aria-labelledby="api-keys-heading">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 id="api-keys-heading" class="text-[13px] font-medium text-tx-dbe7ef">{{ personal ? t('settings.apiKeys.yourKeys') : t('settings.apiKeys.keysHeading') }}</h3>
          <p class="mt-1 text-[11px] text-tx-95aab7">{{ t('settings.apiKeys.keysHint') }}</p>
        </div>
        <Button variant="ghost" size="icon" :aria-label="t('settings.apiKeys.refresh')" :disabled="loading" @click="load">
          <RefreshCw class="size-4" :class="loading ? 'animate-spin motion-reduce:animate-none' : ''" aria-hidden="true" />
        </Button>
      </div>

      <div v-if="loading && !keys.length" class="grid gap-2" aria-busy="true">
        <Skeleton v-for="n in 2" :key="n" class="h-[70px] rounded-[11px]" />
      </div>
      <Alert v-else-if="loadError" variant="destructive" class="flex items-center justify-between gap-4 py-2 text-[12px]">
        <span>{{ loadError }}</span>
        <Button variant="secondary" size="sm" @click="load">{{ t('settings.apiKeys.retry') }}</Button>
      </Alert>
      <div
        v-else-if="!keys.length"
        class="flex flex-col items-center gap-2 rounded-[11px] border border-dashed border-ov/[0.08] px-4 py-7 text-center"
        data-testid="api-keys-empty"
      >
        <span class="grid size-10 place-items-center rounded-full bg-ov/[0.04] text-tx-95aab7" aria-hidden="true">
          <KeyRound class="size-[18px] stroke-[1.75]" />
        </span>
        <p class="text-[12px] font-medium text-tx-dbe7ef">{{ t('settings.apiKeys.emptyTitle') }}</p>
        <p class="max-w-[320px] text-[11px] text-tx-95aab7">
          {{ personal ? t('settings.apiKeys.emptyPersonal') : t('settings.apiKeys.emptyShared') }}
        </p>
      </div>
      <ul v-else class="grid gap-2" data-testid="api-key-list">
        <li
          v-for="key in keys"
          :key="key.id"
          class="rounded-[11px] bg-sx-1d2427 px-4 py-3"
          :class="apiKeyStatus(key) === 'active' ? '' : 'opacity-70'"
          data-testid="api-key-row"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 items-start gap-3">
              <span
                class="grid size-9 flex-none place-items-center rounded-[10px]"
                :class="apiKeyStatus(key) === 'active' ? 'bg-sx-c2e5f5/12 text-tx-c2e5f5' : 'bg-ov/[0.04] text-tx-95aab7'"
                aria-hidden="true"
              >
                <KeyRound class="size-4 stroke-[1.75]" />
              </span>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="truncate text-[13px] font-medium text-tx-dbe7ef">{{ key.label }}</span>
                  <Badge :variant="apiKeyStatus(key) === 'active' ? 'secondary' : apiKeyStatus(key) === 'revoked' ? 'destructive' : 'outline'">
                    {{ t(`settings.apiKeys.status.${apiKeyStatus(key)}`) }}
                  </Badge>
                </div>
                <p class="mt-1 text-[10px] text-tx-95aab7">
                  <template v-if="!personal">{{ ownerName(key.user_id) }} · </template>{{ t('settings.apiKeys.createdOn', { date: formatDate(key.created_at) }) }} ·
                  <template v-if="key.revoked_at">{{ t('settings.apiKeys.revokedOn', { date: formatDate(key.revoked_at) }) }}</template>
                  <template v-else>{{ apiKeyStatus(key) === 'expired' ? t('settings.apiKeys.expiredOn', { date: formatDate(key.expires_at) }) : t('settings.apiKeys.expiresOn', { date: formatDate(key.expires_at) }) }}</template>
                  · {{ key.last_used_at ? t('settings.apiKeys.lastUsed', { date: formatDate(key.last_used_at) }) : t('settings.apiKeys.neverUsed') }}
                </p>
              </div>
            </div>
            <div v-if="!key.revoked_at" class="flex flex-none items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                :aria-label="visible.has(key.id) ? t('settings.apiKeys.hide', { label: key.label }) : t('settings.apiKeys.show', { label: key.label })"
                :disabled="busyKey === key.id"
                @click="toggle(key)"
              >
                <Loader2 v-if="busyKey === key.id" class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                <EyeOff v-else-if="visible.has(key.id)" class="size-4" aria-hidden="true" />
                <Eye v-else class="size-4" aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon" :aria-label="t('settings.apiKeys.copy', { label: key.label })" :disabled="busyKey === key.id" @click="onCopy(key)">
                <Copy class="size-4" aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon" :aria-label="t('settings.apiKeys.revoke', { label: key.label })" @click="revokeTarget = key">
                <ShieldOff class="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <code
            v-if="visible.has(key.id) && tokens[key.id]"
            class="mt-3 block rounded-[8px] bg-sx-151b1e px-3 py-2 font-mono text-[11px] break-all text-tx-c2e5f5 select-all"
            data-testid="api-key-token"
          >{{ tokens[key.id] }}</code>
        </li>
      </ul>
    </section>

    <Dialog :open="created !== null" @update:open="(open) => { if (!open) created = null }">
      <DialogContent class="w-[min(520px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>{{ t('settings.apiKeys.createdDialogTitle') }}</DialogTitle>
          <DialogDescription>{{ t('settings.apiKeys.createdDialogDescription', { label: created?.label ?? '' }) }}</DialogDescription>
        </DialogHeader>
        <code
          class="mt-5 block rounded-[8px] bg-sx-151b1e px-3 py-2.5 font-mono text-[12px] break-all text-tx-c2e5f5 select-all"
          data-testid="created-token"
        >{{ created?.token }}</code>
        <DialogFooter class="mt-6">
          <Button variant="ghost" @click="created = null">{{ t('settings.apiKeys.done') }}</Button>
          <Button @click="onCopyCreated">
            <Copy class="size-3.5" aria-hidden="true" />
            {{ t('settings.apiKeys.copyKey') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="revokeTarget !== null" @update:open="(open) => { if (!open && !revoking) revokeTarget = null }">
      <DialogContent class="w-[min(440px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>{{ t('settings.apiKeys.revokeTitle', { label: revokeTarget?.label ?? '' }) }}</DialogTitle>
          <DialogDescription>{{ t('settings.apiKeys.revokeDescription') }}</DialogDescription>
        </DialogHeader>
        <DialogFooter class="mt-6">
          <Button variant="ghost" :disabled="revoking" @click="revokeTarget = null">{{ t('common.actions.cancel') }}</Button>
          <Button variant="destructive" :disabled="revoking" @click="onRevoke">
            <Loader2 v-if="revoking" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {{ t('settings.apiKeys.revokeKey') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
