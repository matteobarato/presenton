<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Languages } from 'lucide-vue-next'
import { Label } from '@/components/ui/label'
import { AUTO_LANGUAGE, LANGUAGES } from '@/lib/languages'
const { t } = useI18n()

/** `bare` drops the card and header: the Language chip's popover supplies its own title. */
defineProps<{ disabled?: boolean; bare?: boolean }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <section :class="bare ? 'flex flex-col gap-6' : 'flex flex-col gap-6 rounded-card border border-ov/[0.07] bg-gradient-to-b from-ov/[0.03] to-ov/[0.01] p-5 shadow-[inset_0_1px_0_#ffffff0a] max-[520px]:p-4'">
    <header v-if="!bare" class="flex items-center gap-3">
      <span class="grid size-8 flex-none place-items-center rounded-full bg-sx-bee3f31a text-accent" aria-hidden="true"><Languages class="size-4" /></span>
      <span class="flex min-w-0 flex-col">
        <span class="text-[13px] font-semibold tracking-[-0.01em] text-tx-eef4f7">{{ t('create.chips.language') }}</span>
        <span class="text-[12px] text-tx-8e9ca4">{{ t('create.chips.languageHint') }}</span>
      </span>
    </header>
    <div class="flex flex-wrap items-center gap-3">
      <Label for="opt-language" class="sr-only">{{ t('create.chips.language') }}</Label>
      <select
        id="opt-language"
        class="h-10 w-full max-w-[340px] rounded-button border bg-field px-3 text-[13px] text-tx-dce6ec hover:border-ov/15 focus-visible:border-accent disabled:opacity-40"
        :class="model === AUTO_LANGUAGE ? 'border-transparent' : 'border-lx-bee3f355'"
        :value="model"
        :disabled="disabled"
        @change="model = ($event.target as HTMLSelectElement).value"
      >
        <option v-for="l in LANGUAGES" :key="l" :value="l">{{ l }}</option>
      </select>
    </div>
  </section>
</template>
