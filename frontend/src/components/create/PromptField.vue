<script setup lang="ts">
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

defineProps<{ disabled?: boolean }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <Label for="create-prompt" class="text-[11px] font-medium text-[#c5d6e0]">What is your presentation about?</Label>
    <Textarea
      id="create-prompt"
      v-model="model"
      :disabled="disabled"
      class="min-h-[140px] rounded-[11px] border-[#bce0f52b] bg-[#192329] p-4 text-[13px] leading-[1.8] text-[#d8e8f4] placeholder:text-[#8ca6b7]"
      placeholder="Describe the topic, audience and goal. You can also attach documents below."
    />
  </div>
</template>
