<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import WizardFooter from './WizardFooter.vue'
import { claimWizardFooter } from './stepFooter'

/**
 * A step's own footer. Inside the wizard it takes the wizard's footer place (one footer on screen, with the
 * wizard's Back unless the step fills `back`); outside it renders in place. Same props and slots as `WizardFooter`.
 */
defineProps<{ status?: string; error?: string | null; busy?: boolean }>()
const host = claimWizardFooter()
</script>

<template>
  <Teleport v-if="host?.target.value && host.active.value" :to="host.target.value">
    <WizardFooter :status="status" :error="error" :busy="busy">
      <template #back>
        <slot name="back">
          <Button v-if="host?.back.available.value" type="button" variant="ghost" @click="host?.back.go()">
            <ArrowLeft class="size-4" aria-hidden="true" />Back
          </Button>
        </slot>
      </template>
      <template #secondary><slot name="secondary" /></template>
      <template #primary><slot name="primary" /></template>
      <template v-if="$slots.status" #status><slot name="status" /></template>
    </WizardFooter>
  </Teleport>
  <WizardFooter v-else-if="!host" :status="status" :error="error" :busy="busy">
    <template #back><slot name="back" /></template>
    <template #secondary><slot name="secondary" /></template>
    <template #primary><slot name="primary" /></template>
    <template v-if="$slots.status" #status><slot name="status" /></template>
  </WizardFooter>
</template>
