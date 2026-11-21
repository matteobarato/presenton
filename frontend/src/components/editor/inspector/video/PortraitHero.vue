<script setup lang="ts">
import { ref } from 'vue'
import { ImagePlus, Trash2 } from 'lucide-vue-next'
import type { Portrait } from '@/api/videos'
import { Button } from '@/components/ui/button'

/** The deck's presenter portrait, large: it is the face of every avatar. */
defineProps<{ portrait: Portrait | null | undefined; busy: boolean }>()
const emit = defineEmits<{ upload: [file: File]; remove: [] }>()
const input = ref<HTMLInputElement | null>(null)

function picked(e: Event) {
  const el = e.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (file) emit('upload', file)
}
defineExpose({ pick: () => input.value?.click() })
</script>

<template>
  <section class="flex flex-col gap-2" aria-label="Presenter portrait" data-testid="portrait-hero">
    <div class="relative aspect-[4/3] w-full overflow-hidden rounded-card border border-white/[0.06] bg-black/20">
      <img v-if="portrait" :src="portrait.url" alt="Presenter portrait" class="size-full object-cover" />
      <button
        v-else
        type="button"
        class="group relative flex size-full cursor-pointer flex-col items-center justify-end gap-1.5 overflow-hidden bg-gradient-to-b from-white/[0.04] to-accent/[0.08] px-4 pb-4 text-center transition-colors hover:to-accent/[0.16] disabled:cursor-default"
        :disabled="busy"
        @click="input?.click()"
      >
        <!-- Presenter silhouette framed by scan corners: a face goes here. -->
        <img src="/presenter-silhouette.svg" alt="" class="absolute inset-x-0 top-3 opacity-30 mx-auto h-[100%] text-accent/40 transition-colors group-hover:text-accent/70" aria-hidden="true" />
        <span class="relative flex items-center gap-1.5 text-[12px] font-semibold text-[#f6f8f9]"><ImagePlus class="size-3.5" aria-hidden="true" />Add your digital presenter</span>
        <span class="relative text-[11px] leading-[1.4] text-muted">A clear front-facing photo becomes a talking presenter on your slides. JPEG, PNG or WebP, up to 10 MB.</span>
      </button>
      <div v-if="portrait" class="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2 pt-8">
        <Button size="sm" variant="secondary" :disabled="busy" @click="input?.click()">Replace</Button>
        <Button size="sm" variant="ghost" :disabled="busy" aria-label="Remove portrait" @click="emit('remove')">
          <Trash2 class="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
    <input ref="input" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" data-testid="portrait-input" @change="picked" />
  </section>
</template>
