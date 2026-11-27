<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ArrowRight } from 'lucide-vue-next'
import type { FontInfo } from '@/api/templateImport'
import { Button } from '@/components/ui/button'
import FontReplacementList from './FontReplacementList.vue'

/** Step 2 (only when fonts are missing): an optional replacement file per font, or keep the fallback. */
defineProps<{ fonts: FontInfo[]; replacements: Record<string, File>; busy: boolean; error?: string | null }>()
const emit = defineEmits<{ replace: [name: string, file: File | null]; continue: []; back: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="anim-rise-in flex flex-col gap-5" data-testid="import-fonts">
    <div>
      <h2 class="text-[16px] font-medium text-tx-dbe7ef">{{ t('templates.import.fonts.heading') }}</h2>
      <p class="mt-[7px] max-w-[560px] text-[12px] leading-[1.7] text-tx-9aabb4">{{ t('templates.import.fonts.text') }}</p>
    </div>

    <FontReplacementList :fonts="fonts" :replacements="replacements" :busy="busy" @replace="(name, file) => emit('replace', name, file)" />

    <p v-if="error" role="alert" class="text-[12px] text-danger-text">{{ error }}</p>

    <div class="flex items-center justify-between gap-3">
      <Button type="button" variant="ghost" :disabled="busy" @click="emit('back')">{{ t('templates.import.back') }}</Button>
      <Button type="button" :disabled="busy" @click="emit('continue')">
        {{ t('templates.import.fonts.continue') }}
        <ArrowRight class="size-4" aria-hidden="true" />
      </Button>
    </div>
  </div>
</template>
