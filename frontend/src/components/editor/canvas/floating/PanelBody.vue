<script setup lang="ts">
// Frames inspector Sections for a popover: they carry sidebar rhythm (top border, 18px padding) that the
// popover's own padding replaces. Several Sections stack with a hairline between them.
</script>

<template>
  <div class="flex flex-col gap-4 [&>*]:!py-0 [&>*:first-child]:!border-t-0 [&>*:not(:first-child)]:!pt-4">
    <slot />
  </div>
</template>
