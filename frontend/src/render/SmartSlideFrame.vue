<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildSmartSrcdoc } from '@/render/smart-html'

const props = withDefaults(
  defineProps<{ html: string; fonts?: unknown; theme?: unknown; title?: string; interactive?: boolean }>(),
  { fonts: undefined, theme: undefined, title: undefined, interactive: false },
)
const emit = defineEmits<{ rendered: []; error: [message: string] }>()
const { t } = useI18n()

const srcdoc = computed(() => buildSmartSrcdoc(props.html, { fonts: props.fonts, theme: props.theme }))
</script>

<template>
  <iframe
    class="block h-[720px] w-[1280px] border-0 bg-white"
    :class="interactive ? '' : 'pointer-events-none'"
    sandbox="allow-scripts"
    :srcdoc="srcdoc"
    tabindex="-1"
    :title="title ?? t('render.smart.title')"
    @load="emit('rendered')"
    @error="emit('error', t('render.smart.loadFailed'))"
  />
</template>
