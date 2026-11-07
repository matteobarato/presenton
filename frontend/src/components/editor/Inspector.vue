<script setup lang="ts">
import { useEditorFetchGate } from '@/composables/useEditorFetchGate'
import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useRoute } from 'vue-router'
import { usePresentation } from '@/api/presentations'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { slideKey, useEditorStore, type InspectorTabId } from '@/stores/editor'
import { inspectorTabs } from './inspector/tabs'

const route = useRoute()
const editor = useEditorStore()
const id = computed(() => String(route.params.id ?? ''))
const { data: presentation } = usePresentation(id, useEditorFetchGate())
// In the drawer the sheet's close button sits at the top right; keep the tabs clear of it.
const inDrawer = useMediaQuery('(max-width: 1050px)')

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
    <!-- Aera tab strip. -->
    <TabsList
      class="flex h-[57px] w-full flex-none gap-1.5 rounded-none border-b border-line bg-transparent px-3.5 py-[11px] [@media(max-height:780px)_and_(min-width:1051px)]:h-[49px]"
      :class="inDrawer && 'pr-12'"
      aria-label="Inspector sections"
    >
      <TabsTrigger
        v-for="tab in inspectorTabs"
        :key="tab.id"
        :value="tab.id"
        :title="tab.label"
        class="group/tab h-8 flex-1 gap-2 rounded-[8px] px-2 text-[11px] font-normal text-[#a2adb3] data-[state=active]:bg-[#353b3e] data-[state=active]:text-[#edf1f2] data-[state=active]:shadow-[0_2px_4px_#0001]"
      >
        <component :is="tab.icon" class="size-3.5" aria-hidden="true" />
        <span>{{ tab.label }}</span>
      </TabsTrigger>
    </TabsList>
    <div v-if="presentation" class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <TabsContent
v-for="tab in inspectorTabs" :key="tab.id" :value="tab.id" class="mt-0 flex min-h-full flex-col outline-none data-[state=active]:animate-[fade-in_200ms_ease-out] data-[state=inactive]:hidden"
      >
        <component :is="tab.component" :presentation-id="id" :presentation="presentation" :active-slide="activeSlide" />
      </TabsContent>
    </div>
  </Tabs>
</template>
