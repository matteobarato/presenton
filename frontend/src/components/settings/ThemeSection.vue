<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Monitor, Moon, Sun } from 'lucide-vue-next'
import { useTheme, type ThemePreference } from '@/composables/useTheme'

const { t } = useI18n()
const { preference, setPreference } = useTheme()

const OPTIONS: { value: ThemePreference; icon: typeof Sun }[] = [
  { value: 'dark', icon: Moon },
  { value: 'light', icon: Sun },
  { value: 'system', icon: Monitor },
]
</script>

<template>
  <div class="grid gap-3 rounded-[11px] bg-inspector p-4" data-testid="theme-section">
    <div>
      <h3 id="theme-label" class="text-[13px] font-medium text-foreground">{{ t('settings.theme.title') }}</h3>
      <p class="mt-1 text-[11px] text-muted-foreground">{{ t('settings.theme.hint') }}</p>
    </div>
    <div role="radiogroup" aria-labelledby="theme-label" class="inline-grid grid-cols-3 gap-1 rounded-[10px] bg-field p-1">
      <button
        v-for="o in OPTIONS"
        :key="o.value"
        type="button"
        role="radio"
        :aria-checked="preference === o.value"
        class="flex items-center justify-center gap-2 rounded-[8px] px-4 py-2 text-[12px] font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground aria-checked:bg-accent aria-checked:text-accent-ink"
        @click="setPreference(o.value)"
      >
        <component :is="o.icon" class="size-3.5 stroke-[1.75]" aria-hidden="true" />{{ t(`settings.theme.options.${o.value}`) }}
      </button>
    </div>
  </div>
</template>
