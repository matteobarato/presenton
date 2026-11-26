<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ArrowRight, Type, Upload, X } from 'lucide-vue-next'
import { FONT_EXTENSIONS, type FontInfo } from '@/api/templateImport'
import { Button } from '@/components/ui/button'

/** Step 2 (only when fonts are missing): an optional replacement file per font, or keep the fallback. */
defineProps<{ fonts: FontInfo[]; replacements: Record<string, File>; busy: boolean; error?: string | null }>()
const emit = defineEmits<{ replace: [name: string, file: File | null]; continue: []; back: [] }>()
const { t } = useI18n()
const accept = FONT_EXTENSIONS.join(',')

function onPick(name: string, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('replace', name, file)
  input.value = ''
}
</script>

<template>
  <div class="anim-rise-in flex flex-col gap-5" data-testid="import-fonts">
    <div>
      <h2 class="text-[16px] font-medium text-tx-dbe7ef">{{ t('templates.import.fonts.heading') }}</h2>
      <p class="mt-[7px] max-w-[560px] text-[12px] leading-[1.7] text-tx-9aabb4">{{ t('templates.import.fonts.text') }}</p>
    </div>

    <ul class="flex flex-col gap-2" :aria-label="t('templates.import.fonts.listLabel')">
      <li
        v-for="font in fonts"
        :key="font.name"
        class="flex items-center gap-3 rounded-control border border-ov/[0.07] bg-sx-1a2125 px-3.5 py-3 max-[560px]:flex-wrap"
      >
        <span class="grid size-8 flex-none place-items-center rounded-[8px] bg-sx-303d45 text-tx-9db3c0">
          <Type class="size-4" aria-hidden="true" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[13px] font-medium text-tx-dbe7ef">{{ font.name }}</span>
          <span class="block truncate text-[11px] text-tx-95aab7">
            {{ replacements[font.name]?.name ?? t('templates.import.fonts.fallback') }}
          </span>
        </span>
        <button
          v-if="replacements[font.name]"
          type="button"
          class="grid size-8 place-items-center rounded-button text-muted hover:bg-ov/[0.06] hover:text-text"
          :aria-label="t('templates.import.fonts.remove', { name: font.name })"
          :disabled="busy"
          @click="emit('replace', font.name, null)"
        >
          <X class="size-4" aria-hidden="true" />
        </button>
        <label
          class="inline-flex h-[30px] cursor-pointer items-center gap-2 rounded-button border border-ov/[0.09] px-2.5 text-[11px] font-semibold text-tx-d4dadd transition-colors hover:border-ov/[0.16] hover:bg-ov/[0.03] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent max-[560px]:h-11"
        >
          <Upload class="size-3.5" aria-hidden="true" />
          {{ replacements[font.name] ? t('templates.import.fonts.replace') : t('templates.import.fonts.upload') }}
          <input type="file" class="sr-only" :accept="accept" :disabled="busy" @change="onPick(font.name, $event)" />
        </label>
      </li>
    </ul>

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
