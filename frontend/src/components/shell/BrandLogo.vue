<script setup lang="ts">
/**
 * Product identity logo. The dark-ink variant shows on light surfaces; the light-ink
 * variant takes over when the app's resolved theme sets `html.dark` (see useTheme).
 */
withDefaults(defineProps<{ class?: string }>(), { class: 'h-4 w-auto' })

// Bound from script (not a static template src) so Vite does not resolve them as modules.
const darkSrc = '/slideshow-logo-dark-long.svg'
const lightSrc = '/slideshow-logo-light-long.svg'
</script>

<template>
  <span class="inline-flex flex-none items-center">
    <img :src="darkSrc" alt="Slideshows" :class="['brand-logo brand-logo--dark', $props.class]" />
    <img :src="lightSrc" alt="Slideshows" aria-hidden="true" :class="['brand-logo brand-logo--light', $props.class]" />
  </span>
</template>

<style scoped>
.brand-logo--light {
  display: none;
}
:global(html.dark) .brand-logo--dark {
  display: none;
}
:global(html.dark) .brand-logo--light {
  display: block;
}
</style>
