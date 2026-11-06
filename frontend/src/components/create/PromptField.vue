<script setup lang="ts">
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

defineProps<{ disabled?: boolean }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="flex flex-col gap-2">
    <Label for="create-prompt" class="text-[11px] text-muted">What is the presentation about?</Label>
    <Textarea
      id="create-prompt"
      v-model="model"
      :disabled="disabled"
      class="min-h-36 text-[14px]"
      placeholder="Describe the topic, audience and goal. You can also attach documents below."
    />
  </div>
</template>
