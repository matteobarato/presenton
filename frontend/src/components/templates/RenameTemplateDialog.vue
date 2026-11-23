<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ name: string; pending?: boolean }>()
const emit = defineEmits<{ submit: [name: string] }>()
const { t } = useI18n()

const draft = ref(props.name)
watch(open, (isOpen) => {
  if (isOpen) draft.value = props.name
})

const trimmed = computed(() => draft.value.trim())
const canSave = computed(() => !props.pending && !!trimmed.value && trimmed.value !== props.name)

function submit() {
  if (canSave.value) emit('submit', trimmed.value)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <form class="grid gap-4" @submit.prevent="submit">
        <DialogHeader>
          <DialogTitle>{{ t('templates.renameTemplate.title') }}</DialogTitle>
          <DialogDescription>{{ t('templates.renameTemplate.description') }}</DialogDescription>
        </DialogHeader>
        <Input v-model="draft" :aria-label="t('templates.renameTemplate.nameLabel')" autocomplete="off" />
        <DialogFooter>
          <Button type="button" variant="ghost" @click="open = false">{{ t('common.actions.cancel') }}</Button>
          <Button type="submit" :disabled="!canSave">{{ t('common.actions.save') }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
