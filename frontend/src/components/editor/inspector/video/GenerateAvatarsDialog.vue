<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const { t } = useI18n()

const props = defineProps<{ count: number; language: string; pending: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ confirm: [force: boolean] }>()

const force = ref(false)
watch(open, (o) => {
  if (o) force.value = false
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('editorInspector.avatar.dialog.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('editorInspector.avatar.dialog.lead', { count: props.count }, props.count) }}
          <strong>{{ props.language || t('editorInspector.avatar.dialog.narrationLanguage') }}</strong>{{ t('editorInspector.avatar.dialog.tail') }}
        </DialogDescription>
      </DialogHeader>
      <label class="mt-3 flex cursor-pointer items-center gap-2.5 text-[12px] text-tx-d4dadd">
        <Checkbox :model-value="force" data-testid="avatar-force" @update:model-value="force = $event === true" />
        {{ t('editorInspector.avatar.dialog.force') }}
      </label>
      <DialogFooter>
        <Button variant="outline" @click="open = false">{{ t('common.actions.cancel') }}</Button>
        <Button :disabled="pending" @click="emit('confirm', force)">{{ t('editorInspector.avatar.dialog.generate') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
