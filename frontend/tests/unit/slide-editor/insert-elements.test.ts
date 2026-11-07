import { DEFAULT_TEMPLATE_THEME } from '@/render/legacy/lib/template-theme'
import { createElementInsertElements, createImageInsertContent, createTextInsertElements,
  ELEMENT_INSERT_GROUPS, ELEMENT_ICONS, TEXT_INSERT_ITEMS } from '@/slide-editor/insert/insert-elements'

const theme = { ...DEFAULT_TEMPLATE_THEME, primary: '112233', background_text: '445566' }

it('every text item builds at least one text element in the theme text colour', () => {
  for (const item of TEXT_INSERT_ITEMS) {
    const els = createTextInsertElements(item.id, theme)
    expect(els.length).toBeGreaterThan(0)
    expect(['text', 'text-list']).toContain(els[0]!.type)
    expect(JSON.stringify(els)).toContain('445566')
  }
})
it('every shape kind builds one vector and has an icon', () => {
  for (const group of ELEMENT_INSERT_GROUPS) for (const item of group.items) {
    const els = createElementInsertElements(item.id, theme)
    expect(els).toHaveLength(1)
    expect(els[0]!.type).toBe('vector')
    expect(ELEMENT_ICONS[item.id]).toBeTruthy()
  }
})
it('the image item is one image with the placeholder; image-text and image-grid are components', () => {
  expect(createImageInsertContent('image', theme).elements?.[0]).toMatchObject({ type: 'image', data: '/placeholder.jpg' })
  expect(createImageInsertContent('image-text', theme).components).toHaveLength(1)
  expect(createImageInsertContent('image-grid', theme).components?.length).toBeGreaterThan(0)
})
it('unknown kinds build nothing', () => {
  expect(createTextInsertElements('nope')).toEqual([])
  expect(createElementInsertElements('nope')).toEqual([])
})
