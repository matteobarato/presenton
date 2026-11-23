<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { CLASSIC_SETTINGS_URL } from '@/settings/providers'

const { t } = useI18n()
</script>

<template>
  <p class="text-[11px] leading-[1.6] text-tx-95aab7">
    {{ t('settings.signIn.setupPrefix') }}
    <a
      :href="CLASSIC_SETTINGS_URL"
      target="_blank"
      rel="noopener noreferrer"
      class="text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >{{ t('settings.signIn.classicApp') }}</a
    >{{ t('settings.signIn.setupSuffix') }}
  </p>
</template>
