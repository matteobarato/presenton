import { computed, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useRoute, useRouter } from 'vue-router'
import { listThemes, themeKeys, type ThemeRecord } from '@/api/themes'

/** The `?theme=<id>` choice of the create flow, plus the saved-theme list it points into. */
export function useThemeParam() {
  const route = useRoute()
  const router = useRouter()
  const themes = useQuery({ queryKey: themeKeys.all, queryFn: listThemes })

  // Tolerate a malformed list (non-array, null entries) instead of crashing the page.
  const themeList = computed<ThemeRecord[]>(() => {
    const data: unknown = themes.data.value
    return Array.isArray(data) ? data.filter((t): t is ThemeRecord => !!t && typeof t === 'object') : []
  })

  const themeId = computed(() => (typeof route.query.theme === 'string' ? route.query.theme : ''))
  const chosenTheme = computed(() => themeList.value.find((t) => t.id === themeId.value))

  function setTheme(id: string | null) {
    const rest = { ...route.query }
    if (id) rest.theme = id
    else delete rest.theme
    void router.replace({ query: rest })
  }
  const selectedThemeId = computed<string | null>({
    get: () => chosenTheme.value?.id ?? null,
    set: setTheme,
  })

  // A deleted or garbage id must not linger in the URL.
  watch(
    () => [themes.isSuccess.value, themeList.value, themeId.value] as const,
    ([ok, list, id]) => {
      if (ok && id && !list.some((t) => t.id === id)) setTheme(null)
    },
    { immediate: true },
  )

  return { themeList, isPending: themes.isPending, isError: themes.isError, selectedThemeId, chosenTheme }
}
