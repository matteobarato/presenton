// Ported from servers/nextjs/app/(presentation-generator)/presentation/components/PresentationActions.tsx
// (templateBlockFromComponent, componentVariants, templateBlockGroupsFromTemplate, humanizeIdentifier) and
// servers/nextjs/components/slide-editor/importing/template-v2-import.ts (extractTemplateV2MergedComponents).
// Changes: takes merged_components directly instead of a template object; dropped the unused `index` field.
import { isRecord, readArray, readString, type UnknownRecord } from '../model/core'

export type TemplateBlock = {
  key: string
  title: string
  description: string
  elementCount: number
  raw: Record<string, unknown>
}

export type TemplateBlockGroup = {
  key: string
  title: string
  description: string
  variants: TemplateBlock[]
}

function humanizeIdentifier(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function mergedComponentList(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord)
  if (!isRecord(value)) return []
  const components = readArray(value.components)
  if (components.length > 0) return components.filter(isRecord)
  return Object.values(value).filter(isRecord)
}

function templateBlockFromComponent(component: UnknownRecord, index: number): TemplateBlock {
  const id = readString(component.id)
  const title =
    readString(component.name) ??
    readString(component.title) ??
    (id ? humanizeIdentifier(id) : `Component ${index + 1}`)
  return {
    key: `${id ?? title}-${index}`,
    title,
    description: readString(component.description) ?? '',
    elementCount: readArray(component.elements).length,
    raw: component,
  }
}

function componentVariants(component: UnknownRecord): UnknownRecord[] {
  return readArray(component.variants)
    .map((variant, variantIndex): UnknownRecord | null => {
      if (!isRecord(variant)) return null
      return {
        ...component,
        ...variant,
        id: readString(variant.id) ?? `${readString(component.id) ?? 'component'}_variant_${variantIndex + 1}`,
        name:
          readString(variant.name) ??
          readString(variant.title) ??
          readString(component.name) ??
          readString(component.title),
        description: readString(variant.description) ?? readString(component.description),
      }
    })
    .filter((variant): variant is UnknownRecord => variant !== null)
}

/** Insertable blocks of a template, grouped by component with one entry per variant. */
export function templateBlockGroups(mergedComponents: unknown): TemplateBlockGroup[] {
  return mergedComponentList(mergedComponents).map((component, componentIndex) => {
    const base = templateBlockFromComponent(component, componentIndex)
    const variants = componentVariants(component)
    const sources = variants.length > 0 ? variants : [component]
    return {
      key: base.key,
      title: base.title,
      description: base.description,
      variants: sources.map((variant, variantIndex) => ({
        ...templateBlockFromComponent(variant, componentIndex),
        key: `${base.key}-variant-${variantIndex}`,
      })),
    }
  })
}

const NON_TEMPLATE_GROUPS = new Set(['', 'smart-html', 'no', 'blank', 'template-v2'])

function templateIdOf(layoutGroup: string | null | undefined): string | null {
  const id = (layoutGroup ?? '').trim().replace(/^template-v2[:-]/, '')
  return NON_TEMPLATE_GROUPS.has(id) ? null : id
}

/** The template a deck was generated from: the active slide's, else the first slide that has one. */
export function deckTemplateId(
  slides: readonly { id: string; layout_group?: string | null }[],
  activeSlideId?: string | null,
): string | null {
  const active = activeSlideId ? slides.find((s) => s.id === activeSlideId) : undefined
  const fromActive = active ? templateIdOf(active.layout_group) : null
  if (fromActive) return fromActive
  for (const slide of slides) {
    const id = templateIdOf(slide.layout_group)
    if (id) return id
  }
  return null
}
