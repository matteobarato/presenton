// replaceIconWeightInUrl ported from servers/nextjs/components/slide-editor/images/IconsEditor.tsx. Changes: typed for TS, weight is an IconWeight, null urls are not accepted.
import type { IconWeight } from '@/slide-editor/elementStyle'
import { api, unwrap } from './client'

export const ICON_WEIGHTS: IconWeight[] = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone']

const ICON_PATH = new RegExp(`(/static/icons/)([^/]+)/([^/?#]+?)(?:-(${ICON_WEIGHTS.join('|')}))?(\\.(?:svg|png))([?#].*)?$`, 'i')

/** Rewrites `/static/icons/<weight>/<name>[-<weight>].<ext>` for another weight ("regular" has no suffix). */
export function replaceIconWeightInUrl(url: string, weight: IconWeight): string {
  if (!url) return ''
  return url.replace(
    ICON_PATH,
    (_m, prefix: string, _folder: string, name: string, _suffix: string, ext: string, trailing = '') =>
      `${prefix}${weight}/${name}${weight === 'regular' ? '' : `-${weight}`}${ext}${trailing}`,
  )
}

/** `GET icons/search?query=&limit=&icon_weight=` resolves to icon URLs. */
export function searchIcons(params: { query: string; limit?: number; icon_weight: IconWeight }, signal?: AbortSignal): Promise<string[]> {
  const { query, limit = 40, icon_weight } = params
  return unwrap(api.GET('/api/v1/ppt/icons/search', { params: { query: { query, limit, icon_weight } }, signal }))
}
