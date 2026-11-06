<script setup lang="ts">
import { Toaster as Sonner, type ToasterProps } from 'vue-sonner'
import 'vue-sonner/style.css'

const props = defineProps<ToasterProps>()

const toastOptions = {
  classes: {
    toast: '!rounded-card !border-[#a3c7db20] !bg-dialog !text-[#dce8ee] !shadow-[0_12px_35px_#0005] !text-[11px]',
  },
}
</script>

<template>
  <Sonner v-bind="props" theme="dark" :toast-options="toastOptions" />
</template>
