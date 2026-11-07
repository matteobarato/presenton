import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { getTemplate, templateDetailKey } from '@/api/outlines'
import type { TemplateSummary } from '@/api/templates'

const isLayout = (l: unknown): l is Record<string, unknown> => !!l && typeof l === 'object'

/**
 * Layouts for a template. Summaries that already carry object layouts are used as-is;
 * otherwise (custom templates, built-in scan entries) they load via `templateDetailKey`.
 */
export function useTemplateLayouts(template: MaybeRefOrGetter<TemplateSummary | undefined>) {
  const summary = computed(() => toValue(template))
  const hasReal = computed(() => !!summary.value?.layouts.some(isLayout))
  const needsFetch = computed(() => !!summary.value && !hasReal.value && summary.value.layouts.length > 0)

  const query = useQuery({
    queryKey: computed(() => templateDetailKey(summary.value?.id ?? '')),
    queryFn: () => getTemplate(summary.value!.id),
    enabled: needsFetch,
  })

  const layouts = computed<Record<string, unknown>[]>(() => {
    if (hasReal.value) return summary.value!.layouts.filter(isLayout)
    return (query.data.value?.layouts ?? []).filter(isLayout)
  })
  const theme = computed(() => (hasReal.value ? summary.value?.theme : query.data.value?.theme))
  const fonts = computed(() => (hasReal.value ? summary.value?.fonts : query.data.value?.fonts))
  const pending = computed(() => needsFetch.value && query.isPending.value && !query.isError.value)
  const failed = computed(() => needsFetch.value && query.isError.value)

  return {
    layouts,
    theme,
    fonts,
    pending,
    failed,
    retry: () => {
      void query.refetch()
    },
  }
}
