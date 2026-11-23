<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'
import { ImagePlus, Trash2 } from 'lucide-vue-next'
import type { Portrait } from '@/api/videos'
import { Button } from '@/components/ui/button'

const { t } = useI18n()

defineProps<{ portrait: Portrait | null | undefined; busy: boolean }>()
const emit = defineEmits<{ upload: [file: File]; remove: [] }>()
const input = ref<HTMLInputElement | null>(null)

function picked(e: Event) {
  const el = e.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (file) emit('upload', file)
}
</script>

<template>
  <section class="flex flex-col gap-2" :aria-label="t('editorInspector.avatar.portrait.ariaLabel')" data-testid="portrait-card">
    <h3 class="text-[12px] font-semibold text-tx-f6f8f9">{{ t('editorInspector.avatar.portrait.ariaLabel') }}</h3>
    <p class="text-[11px] text-muted">{{ t('editorInspector.avatar.portrait.cardHint') }}</p>
    <div class="flex items-center gap-3">
      <img
        v-if="portrait"
        :src="portrait.url"
        :alt="t('editorInspector.avatar.portrait.ariaLabel')"
        class="size-16 rounded-control object-cover"
      />
      <div v-else class="grid size-16 place-items-center rounded-control border border-dashed border-ov/15 text-muted">
        <ImagePlus class="size-5" aria-hidden="true" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Button size="sm" variant="secondary" :disabled="busy" @click="input?.click()">
          {{ portrait ? t('editorInspector.avatar.portrait.cardReplace') : t('editorInspector.avatar.portrait.cardUpload') }}
        </Button>
        <Button v-if="portrait" size="sm" variant="ghost" :disabled="busy" @click="emit('remove')">
          <Trash2 class="size-3.5" aria-hidden="true" />
          {{ t('editorInspector.avatar.portrait.cardRemove') }}
        </Button>
      </div>
      <input ref="input" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" data-testid="portrait-input" @change="picked" />
    </div>
  </section>
</template>
