<script setup lang="ts">
import { ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

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
        <DialogTitle>Generate avatars</DialogTitle>
        <DialogDescription>
          {{ props.count }} {{ props.count === 1 ? 'slide' : 'slides' }} will get a lip-synced avatar in
          <strong>{{ props.language || 'the narration language' }}</strong>, made from the presenter portrait and each
          slide's narration. Avatars are tied to that language. HeyGen credits are spent for every slide that is not skipped.
        </DialogDescription>
      </DialogHeader>
      <label class="mt-3 flex cursor-pointer items-center gap-2.5 text-[12px] text-[#d4dadd]">
        <Checkbox :model-value="force" data-testid="avatar-force" @update:model-value="force = $event === true" />
        Regenerate slides whose avatar is already up to date
      </label>
      <DialogFooter>
        <Button variant="outline" @click="open = false">Cancel</Button>
        <Button :disabled="pending" @click="emit('confirm', force)">Generate</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
