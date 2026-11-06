<script setup lang="ts">
import { useEditorFetchGate } from '@/composables/useEditorFetchGate'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { usePresentation } from '@/api/presentations'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { slideKey, useEditorStore, type InspectorTabId } from '@/stores/editor'
import { inspectorTabs } from './inspector/tabs'

const route = useRoute()
const editor = useEditorStore()
const id = computed(() => String(route.params.id ?? ''))
const { data: presentation } = usePresentation(id, useEditorFetchGate())

const activeSlide = computed(() => {
  const slides = presentation.value?.slides ?? []
  return slides.find((s) => slideKey(s) === editor.activeSlideId) ?? slides[0] ?? null
})
</script>

<template>
  <Tabs
    :model-value="editor.inspectorTab"
    class="min-h-0 flex-1 gap-0"
    @update:model-value="editor.inspectorTab = $event as InspectorTabId"
  >
    <TabsList class="m-3 flex flex-none gap-0.5 rounded-button bg-black/20 p-0.5" aria-label="Inspector sections">
      <TabsTrigger v-for="tab in inspectorTabs" :key="tab.id" :value="tab.id" :title="tab.label" class="px-0">
        <component :is="tab.icon" class="size-3.5" aria-hidden="true" />
        <span class="sr-only min-[1280px]:not-sr-only">{{ tab.label }}</span>
      </TabsTrigger>
    </TabsList>
    <div v-if="presentation" class="min-h-0 flex-1 overflow-y-auto">
      <TabsContent v-for="tab in inspectorTabs" :key="tab.id" :value="tab.id" class="mt-0 outline-none">
        <component :is="tab.component" :presentation-id="id" :presentation="presentation" :active-slide="activeSlide" />
      </TabsContent>
    </div>
  </Tabs>
</template>
