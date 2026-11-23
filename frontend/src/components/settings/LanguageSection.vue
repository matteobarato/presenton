<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useUiLocale } from '@/i18n/useUiLocale'
import { UI_LOCALES } from '@/i18n'

const { t } = useI18n()
const { locale, setLocale } = useUiLocale()
</script>

<template>
  <div class="grid gap-3 rounded-[11px] bg-inspector p-4" data-testid="language-section">
    <div>
      <h3 id="language-label" class="text-[13px] font-medium text-foreground">{{ t('common.language.title') }}</h3>
      <p class="mt-1 text-[11px] text-muted-foreground">{{ t('common.language.hint') }}</p>
    </div>
    <div role="radiogroup" aria-labelledby="language-label" class="inline-grid grid-cols-2 gap-1 rounded-[10px] bg-field p-1">
      <button
        v-for="l in UI_LOCALES"
        :key="l"
        type="button"
        role="radio"
        :aria-checked="locale === l"
        class="flex items-center justify-center rounded-[8px] px-4 py-2 text-[12px] font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground aria-checked:bg-accent aria-checked:text-accent-ink"
        @click="setLocale(l)"
      >
{{ t(`common.language.${l}`) }}
</button>
    </div>
  </div>
</template>
