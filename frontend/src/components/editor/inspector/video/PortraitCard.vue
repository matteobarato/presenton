<script setup lang="ts">
import { ref } from 'vue'
import { ImagePlus, Trash2 } from 'lucide-vue-next'
import type { Portrait } from '@/api/videos'
import { Button } from '@/components/ui/button'

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
  <section class="flex flex-col gap-2" aria-label="Presenter portrait">
    <h3 class="text-[12px] font-semibold text-[#f6f8f9]">Presenter portrait</h3>
    <p class="text-[11px] text-muted">The picture avatars are lip-synced from. JPEG, PNG or WebP, up to 10 MB.</p>
    <div class="flex items-center gap-3">
      <img
        v-if="portrait"
        :src="portrait.url"
        alt="Presenter portrait"
        class="size-16 rounded-control object-cover"
      />
      <div v-else class="grid size-16 place-items-center rounded-control border border-dashed border-white/15 text-muted">
        <ImagePlus class="size-5" aria-hidden="true" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Button size="sm" variant="secondary" :disabled="busy" @click="input?.click()">
          {{ portrait ? 'Replace portrait' : 'Upload portrait' }}
        </Button>
        <Button v-if="portrait" size="sm" variant="ghost" :disabled="busy" @click="emit('remove')">
          <Trash2 class="size-3.5" aria-hidden="true" />
          Remove portrait
        </Button>
      </div>
      <input ref="input" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" data-testid="portrait-input" @change="picked" />
    </div>
  </section>
</template>
