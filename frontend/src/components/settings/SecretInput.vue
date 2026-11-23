<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { Eye, EyeOff } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'

const props = defineProps<{ modelValue: string; label: string; placeholder?: string; optional?: boolean; id?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useI18n()
const generatedId = useId()
const inputId = computed(() => props.id ?? `secret-${generatedId}`)
const shown = ref(false)
const labelText = computed(() =>
  props.optional && !/\(optional\)/i.test(props.label) ? t('settings.shared.optionalLabel', { label: props.label }) : props.label,
)
</script>

<template>
  <div class="min-w-0">
    <label :for="inputId" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ labelText }}</label>
    <div class="relative">
      <Input
        :id="inputId"
        :type="shown ? 'text' : 'password'"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :placeholder="placeholder"
        :model-value="modelValue"
        class="pr-10"
        @update:model-value="emit('update:modelValue', String($event))"
      />
      <button
        type="button"
        :aria-label="shown ? t('settings.secret.hide') : t('settings.secret.show')"
        class="absolute inset-y-0 right-0 grid w-9 place-items-center rounded-button text-muted transition-colors hover:text-tx-f6f8f9 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
        @click="shown = !shown"
      >
        <EyeOff v-if="shown" class="size-4" aria-hidden="true" />
        <Eye v-else class="size-4" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
