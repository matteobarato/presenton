import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { getTemplate, templateDetailKey } from '@/api/outlines'
import { templateBlockGroups } from '@/slide-editor/insert/templateBlocks'

/** Insertable blocks (and theme/fonts) of a deck's template, loaded only while `enabled`. */
export function useTemplateBlocks(templateId: MaybeRefOrGetter<string | null>, enabled: MaybeRefOrGetter<boolean>) {
  const id = computed(() => toValue(templateId))
  const query = useQuery({
    queryKey: computed(() => templateDetailKey(id.value ?? '')),
    queryFn: () => getTemplate(id.value!),
    enabled: computed(() => !!id.value && toValue(enabled)),
    staleTime: Infinity,
    retry: 1,
  })

  return {
    groups: computed(() => templateBlockGroups(query.data.value?.mergedComponents)),
    theme: computed(() => query.data.value?.theme),
    fonts: computed(() => query.data.value?.fonts),
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}
