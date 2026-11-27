<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowRight } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/** Step 3: the rendered slides, a name and an optional description, then start the import. */
const props = defineProps<{ slides: string[]; busy: boolean; error?: string | null }>()
const name = defineModel<string>('name', { required: true })
const description = defineModel<string>('description', { required: true })
const emit = defineEmits<{ create: []; back: [] }>()
const { t } = useI18n()
const canCreate = computed(() => !props.busy && name.value.trim().length > 0)
</script>

<template>
  <form class="anim-rise-in flex flex-col gap-6" data-testid="import-review" @submit.prevent="canCreate && emit('create')">
    <div class="grid grid-cols-[minmax(0,1fr)_300px] gap-6 max-[1050px]:grid-cols-1">
      <section class="min-w-0">
        <h2 class="mb-3 text-[14px] font-medium text-tx-dbe7ef">
          {{ t('templates.import.review.found', { count: slides.length }, slides.length) }}
        </h2>
        <ol class="grid list-none grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3 max-[520px]:grid-cols-2 max-[520px]:gap-2.5">
          <li v-for="(src, i) in slides" :key="src" class="flex min-w-0 flex-col gap-1.5">
            <img
              :src="src"
              :alt="t('templates.import.review.slideAlt', { n: i + 1 })"
              loading="lazy"
              class="aspect-video w-full rounded-[9px] border border-ov/[0.07] bg-sx-101416 object-contain"
            />
            <span class="px-0.5 text-[12px] text-tx-899296 tabular-nums" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>
          </li>
        </ol>
      </section>

      <aside class="flex flex-col gap-4 self-start rounded-card border border-ov/[0.07] bg-sx-1a2125 p-4 min-[1051px]:sticky min-[1051px]:top-4">
        <div class="flex flex-col gap-2">
          <Label for="import-name">{{ t('templates.import.review.nameLabel') }}</Label>
          <Input id="import-name" v-model="name" autocomplete="off" maxlength="120" :disabled="busy" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="import-description">{{ t('templates.import.review.descriptionLabel') }}</Label>
          <Textarea
            id="import-description"
            v-model="description"
            rows="3"
            maxlength="500"
            :placeholder="t('templates.import.review.descriptionPlaceholder')"
            :disabled="busy"
          />
        </div>
        <p v-if="error" role="alert" class="text-[12px] text-danger-text">{{ error }}</p>
        <Button type="submit" class="w-full" :disabled="!canCreate">
          {{ busy ? t('templates.import.review.creating') : t('templates.import.review.create') }}
          <ArrowRight v-if="!busy" class="size-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" class="w-full" :disabled="busy" @click="emit('back')">{{ t('templates.import.back') }}</Button>
      </aside>
    </div>
  </form>
</template>
