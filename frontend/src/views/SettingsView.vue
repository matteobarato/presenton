<script setup lang="ts">
import { computed, onBeforeUnmount, watch, type Component } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import AccountSection from '@/components/settings/AccountSection.vue'
import ApiKeysSection from '@/components/settings/ApiKeysSection.vue'
import ImagesSection from '@/components/settings/ImagesSection.vue'
import ReadOnlySummary from '@/components/settings/ReadOnlySummary.vue'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar.vue'
import SettingsSidebar from '@/components/settings/SettingsSidebar.vue'
import TextSection from '@/components/settings/TextSection.vue'
import UsersSection from '@/components/settings/UsersSection.vue'
import WebSearchSection from '@/components/settings/WebSearchSection.vue'
import PageHeader from '@/components/shell/PageHeader.vue'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSettingsAccess } from '@/composables/useSettingsAccess'
import { useSettingsDraft } from '@/composables/useSettingsDraft'
import { defaultSettingsSection, isProviderSection, visibleSettingsSections, type ProviderSection, type SettingsSection } from '@/settings/types'
import { SECTION_ICONS } from '@/settings/sectionIcons'
import { useSessionStore } from '@/stores/session'

const TITLES: Record<SettingsSection, string> = {
  text: 'Text',
  images: 'Images',
  'web-search': 'Web search',
  users: 'Users',
  'api-keys': 'API keys',
  account: 'Account',
}
const EDITORS: Record<ProviderSection, Component> = {
  text: TextSection,
  images: ImagesSection,
  'web-search': WebSearchSection,
}
const LEAVE_PROMPT = 'You have unsaved changes. Leave without saving?'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const access = useSettingsAccess()
const { draft, dirty, saving, load, set, discard, save } = useSettingsDraft()

const isAdmin = computed(() => session.user?.role === 'admin')
const sections = computed(() => visibleSettingsSections(isAdmin.value, session.user?.authDisabled === true))
const section = computed<SettingsSection>(() => {
  const value = String(route.params.section)
  return (sections.value as string[]).includes(value) ? (value as SettingsSection) : defaultSettingsSection(isAdmin.value)
})
// Users, API keys and Account don't depend on the provider settings load, so they render
// even while it is loading, failed, or locked (CAN_CHANGE_KEYS=false).
const standalone = computed(() => !isProviderSection(section.value))

// A non-admin who lands on a provider or Users URL is sent to Account.
watch(
  () => [route.params.section, isAdmin.value] as const,
  ([value]) => {
    if (String(value) !== section.value) void router.replace({ name: 'settings', params: { section: section.value } })
  },
  { immediate: true },
)
const readOnlyMode = computed(() => (access.mode.value === 'locked' || access.mode.value === 'managed' ? access.mode.value : null))
const runtimeConfig = computed(() => session.runtime?.config ?? {})
// Only the stored email string (never a token) reaches the editor; the draft itself stays stripped.
const accountEmail = computed(() => {
  const email = access.config.value?.PRESENTON_EMAIL
  return typeof email === 'string' && email.trim() ? email : undefined
})

// The access composable owns loading; the draft is seeded whenever the config arrives.
watch(
  () => access.mode.value,
  (mode) => {
    if (mode === 'edit' && access.config.value) load(access.config.value)
  },
  { immediate: true },
)

function go(next: SettingsSection) {
  void router.push({ name: 'settings', params: { section: next } })
}

// Sign-out discards the draft first, so declining the prompt keeps the user signed in and the keys hidden.
async function onSignOut() {
  if (dirty.value && !window.confirm(LEAVE_PROMPT)) return
  discard()
  await session.signOut().catch(() => {})
  await router.push({ name: 'login' })
}

async function onSave() {
  const result = await save()
  if (!result.ok && result.section) go(result.section)
}

onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm(LEAVE_PROMPT)) return false
})

function warnOnUnload(event: BeforeUnloadEvent) {
  event.preventDefault()
  event.returnValue = ''
}
watch(
  dirty,
  (isDirty) => {
    if (isDirty) window.addEventListener('beforeunload', warnOnUnload)
    else window.removeEventListener('beforeunload', warnOnUnload)
  },
  { immediate: true },
)
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnOnUnload))
</script>

<template>
  <PageHeader title="Settings" />

  <section class="workspace-card">
    <div class="anim-rise-in mb-[33px]">
      <h1 class="text-[34px] leading-[1.22] font-medium tracking-[-0.04em] text-tx-e4ecf0 max-[1050px]:text-[30px] max-[760px]:text-[27px] max-[450px]:text-[25px]">
        Settings
      </h1>
      <p class="mt-[13px] text-[12px] text-tx-9aabb4 max-[760px]:text-[11px] max-[760px]:leading-[1.7]">
        {{ isAdmin ? 'Choose the providers that write, illustrate and research your decks, and manage who can use them.' : 'Manage your account, password and personal API keys.' }}
      </p>
    </div>

    <div v-if="standalone" class="flex gap-8 max-[760px]:flex-col max-[760px]:gap-5">
      <SettingsSidebar v-if="sections.length > 1" :section="section" :sections="sections" :config="readOnlyMode ? runtimeConfig : draft" @select="go" />
      <div class="min-w-0 flex-1">
        <h2 class="mb-5 flex items-center gap-2.5 text-[16px] font-medium text-tx-e4ecf0">
          <component :is="SECTION_ICONS[section]" class="size-[18px] stroke-[1.75] text-tx-c2e5f5" aria-hidden="true" />
          {{ TITLES[section] }}
        </h2>
        <UsersSection v-if="section === 'users'" />
        <ApiKeysSection v-else-if="section === 'api-keys'" :scope="isAdmin ? 'all' : 'mine'" />
        <AccountSection v-else @sign-out="onSignOut" />
      </div>
    </div>

    <div v-else-if="access.mode.value === 'loading'" class="grid gap-3" aria-busy="true">
      <Skeleton v-for="n in 4" :key="n" class="h-[58px] rounded-[11px]" />
    </div>

    <Alert v-else-if="access.mode.value === 'error'" variant="destructive" class="flex items-center justify-between gap-4 py-2 text-[12px]">
      <span>{{ access.error.value }}</span>
      <Button variant="secondary" size="sm" @click="access.reload()">Retry</Button>
    </Alert>

    <div v-else class="flex gap-8 max-[760px]:flex-col max-[760px]:gap-5">
      <SettingsSidebar :section="section" :sections="sections" :config="readOnlyMode ? runtimeConfig : draft" @select="go" />

      <div class="min-w-0 flex-1">
        <h2 class="mb-5 flex items-center gap-2.5 text-[16px] font-medium text-tx-e4ecf0">
          <component :is="SECTION_ICONS[section]" class="size-[18px] stroke-[1.75] text-tx-c2e5f5" aria-hidden="true" />
          {{ TITLES[section] }}
        </h2>
        <ReadOnlySummary v-if="readOnlyMode" :mode="readOnlyMode" :config="runtimeConfig" />
        <template v-else>
          <fieldset :disabled="saving" class="m-0 min-w-0 border-0 p-0">
            <component :is="EDITORS[section as ProviderSection]" :config="draft" :account-email="accountEmail" @set="set" />
          </fieldset>
          <SettingsSaveBar :dirty="dirty" :saving="saving" @save="onSave" @discard="discard" />
        </template>
      </div>
    </div>
  </section>
</template>
