<script setup lang="ts">
import { computed, onBeforeUnmount, watch, type Component } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import AccountSection from '@/components/settings/AccountSection.vue'
import ReadOnlySummary from '@/components/settings/ReadOnlySummary.vue'
import SectionPlaceholder from '@/components/settings/SectionPlaceholder.vue'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar.vue'
import SettingsSidebar from '@/components/settings/SettingsSidebar.vue'
import PageHeader from '@/components/shell/PageHeader.vue'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSettingsAccess } from '@/composables/useSettingsAccess'
import { useSettingsDraft } from '@/composables/useSettingsDraft'
import { SETTINGS_SECTIONS, type SettingsSection } from '@/settings/types'
import { useSessionStore } from '@/stores/session'

const TITLES: Record<SettingsSection, string> = {
  text: 'Text',
  images: 'Images',
  'web-search': 'Web search',
  account: 'Account',
}
// Replaced by the real section components in later tasks.
const EDITORS: Record<Exclude<SettingsSection, 'account'>, Component> = {
  text: SectionPlaceholder,
  images: SectionPlaceholder,
  'web-search': SectionPlaceholder,
}
const LEAVE_PROMPT = 'You have unsaved changes. Leave without saving?'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const access = useSettingsAccess()
const { draft, dirty, saving, load, set, discard, save } = useSettingsDraft()

const section = computed<SettingsSection>(() => {
  const value = String(route.params.section)
  return (SETTINGS_SECTIONS as string[]).includes(value) ? (value as SettingsSection) : 'text'
})
const readOnlyMode = computed(() => (access.mode.value === 'locked' || access.mode.value === 'managed' ? access.mode.value : null))
const runtimeConfig = computed(() => session.runtime?.config ?? {})

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
      <h1 class="text-[34px] leading-[1.22] font-medium tracking-[-0.04em] text-[#e4ecf0] max-[1050px]:text-[30px] max-[760px]:text-[27px] max-[450px]:text-[25px]">
        Settings
      </h1>
      <p class="mt-[13px] text-[12px] text-[#9aabb4] max-[760px]:text-[11px] max-[760px]:leading-[1.7]">
        Choose the providers that write, illustrate and research your decks.
      </p>
    </div>

    <div v-if="access.mode.value === 'loading'" class="grid gap-3" aria-busy="true">
      <Skeleton v-for="n in 4" :key="n" class="h-[58px] rounded-[11px]" />
    </div>

    <Alert v-else-if="access.mode.value === 'error'" variant="destructive" class="flex items-center justify-between gap-4 py-2 text-[12px]">
      <span>{{ access.error.value }}</span>
      <Button variant="secondary" size="sm" @click="access.reload()">Retry</Button>
    </Alert>

    <div v-else class="flex gap-8 max-[760px]:flex-col max-[760px]:gap-5">
      <SettingsSidebar :section="section" :config="readOnlyMode ? runtimeConfig : draft" @select="go" />

      <div class="min-w-0 flex-1">
        <h2 class="mb-5 text-[16px] font-medium text-[#e4ecf0]">{{ TITLES[section] }}</h2>
        <AccountSection v-if="section === 'account'" />
        <ReadOnlySummary v-else-if="readOnlyMode" :mode="readOnlyMode" :config="runtimeConfig" />
        <template v-else>
          <fieldset :disabled="saving" class="m-0 min-w-0 border-0 p-0">
            <component :is="EDITORS[section]" :config="draft" @set="set" />
          </fieldset>
          <SettingsSaveBar :dirty="dirty" :saving="saving" @save="onSave" @discard="discard" />
        </template>
      </div>
    </div>
  </section>
</template>
