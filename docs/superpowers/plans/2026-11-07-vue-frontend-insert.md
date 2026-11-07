# Insert: template blocks and basic elements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Insert tab in the editor inspector that adds the deck template's blocks and basic elements (text presets, images, shapes/lines) to the active template slide.

**Architecture:** Trimmed port of the old `insert-elements.ts` and the old block extraction into `frontend/src/slide-editor/insert/`; one new op `insertContent` on top of the already-ported `appendInsertedContent`; a new `InsertTab.vue` that commits through the shared `useSlideEditing` context, exactly like the Element tab.

**Tech Stack:** Vue 3 + Vite, TypeScript, Pinia, @tanstack/vue-query, shadcn-vue, Tailwind v4, lucide-vue-next, Vitest + @vue/test-utils, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-vue-frontend-insert-design.md`

## Global Constraints

- Work only in `frontend/` (and `docs/`). Never modify `servers/nextjs`; port by copying.
- Template slides only: no insert on smart slides; no smart-mode code paths.
- Every ported file starts with `// Ported from servers/nextjs/<path>. Changes: <list>.`
- Aera fidelity: reuse the ElementTab section grammar (section labels, `rounded-control`, `#f0f2f3` / `#a0abb1` text, 150–250ms fades). Additive only.
- Commit label for every insert: `Insert <item label>` (e.g. `Insert Title`, `Insert Rectangle`, `Insert Metric Cards`).
- Cascade offset = `PASTE_OFFSET` (16px), at most 20 shifts, "occupied" = an existing component's absolute box top-left within ±2px.
- Placeholder image src: `/placeholder.jpg` (copied to `frontend/public/placeholder.jpg`).
- Out of scope: charts, tables, infographics, video, equation inserts; drag-and-drop; shape styling.
- `npm run check` (vue-tsc, vitest, eslint) must pass after every task; run from `frontend/`.

## Review Focus

1. Inserting while the inline text editor is open — the typed text must be committed to its slide before the insert lands, and not be lost. (Task 5 test `commits an open inline edit before inserting`.)
2. Inserting the same block variant twice — two components, distinct ids, second one shifted 16px. (Task 3 tests.)
3. Deck whose first slide is a smart slide (`layout_group: "smart-html"`) — template id must still come from a template slide. (Task 2 test `skips smart slides`.)
4. Selecting the inserted item must not yank the user to the Element tab, but a normal canvas click still must. (Task 4 tests.)
5. Image picker open, user switches slide, then picks — the image lands on the slide where the tile was clicked (`commitTo`). (Task 5 test `image insert targets the slide it was started on`.)

---

### Task 1: Port the insert presets

**Files:**
- Create: `frontend/src/slide-editor/insert/insert-elements.ts`
- Create: `frontend/public/placeholder.jpg` (copy of `servers/nextjs/public/placeholder.jpg`)
- Test: `frontend/tests/unit/slide-editor/insert-elements.test.ts`

**Interfaces:**
- Produces:
  - `type InsertItem = { id: string; label: string; icon: Component }`
  - `TEXT_INSERT_ITEMS: InsertItem[]` — ids/labels in order: `title-block` Title, `subtitle` Subtitle, `body-text` Body text, `bullet-list` Bullet list, `numbered-list` Numbered list, `quote` Quote (icons as in old `PresentationActions.tsx` `textItems`).
  - `IMAGE_INSERT_ITEMS: InsertItem[]` — `image` Image, `image-text` Image + Text, `image-grid` Image grid.
  - `ELEMENT_INSERT_GROUPS` (unchanged from old), `type ElementInsertKind`, `ELEMENT_ICONS: Record<ElementInsertKind, Component>` (old `elementIconById`, lucide-vue-next equivalents).
  - `type EditorInsertContent = { elements?: SlideElement[]; components?: TemplateV2InsertComponent[] }` and `type TemplateV2InsertComponent = { id?: string; description?: string; position: { x: number; y: number }; elements: SlideElement[] }` (defined in this file).
  - `createTextInsertElements(kind: string, theme?: TemplateTheme): SlideElement[]`
  - `createImageInsertContent(kind: string, theme?: TemplateTheme): EditorInsertContent`
  - `createElementInsertElements(kind: string, theme?: TemplateTheme): SlideElement[]`

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/unit/slide-editor/insert-elements.test.ts` → FAIL (module not found).

- [ ] **Step 3: Port** — copy `servers/nextjs/components/slide-editor/insert/insert-elements.ts`, then:
  - Remove chart, infographic, table, math/LaTeX code: `MATH_INSERT_PRESETS`, `makeLatexTextElement`, `makeTableCell`, `chartTypeFromPaletteId` … `createDefaultTableInsertElements`, the `equation*` cases, `themeTableCell`, `themeInfographicIcons`, the `chart`/`table`/`infographic` cases of `applyTemplateThemeToElement`, the exported `createChart/Infographic/TableInsertElements`, and their imports (`chart-data`, `@/lib/math`, `infographic-*`).
  - Rewrite imports: types from `@/render/legacy/components/slide-editor/types`, text helpers from `@/render/legacy/components/slide-editor/text/template-v2-text`, theme from `@/render/legacy/lib/template-theme`.
  - Add `TEXT_INSERT_ITEMS`, `IMAGE_INSERT_ITEMS`, `ELEMENT_ICONS` (lucide-vue-next) and the two types above.
  - Header comment lists these changes.
  - `cp servers/nextjs/public/placeholder.jpg frontend/public/placeholder.jpg`.

- [ ] **Step 4: Run tests** — same command → PASS; then `npx vue-tsc -b` → no errors.

- [ ] **Step 5: Commit** — `git add frontend/src/slide-editor/insert/insert-elements.ts frontend/public/placeholder.jpg frontend/tests/unit/slide-editor/insert-elements.test.ts && git commit -m "feat(frontend): port text, image and shape insert presets"`

---

### Task 2: Template blocks

**Files:**
- Create: `frontend/src/slide-editor/insert/templateBlocks.ts`
- Modify: `frontend/src/api/outlines.ts` (`getTemplate` also returns `mergedComponents`)
- Create: `frontend/src/composables/useTemplateBlocks.ts`
- Test: `frontend/tests/unit/slide-editor/templateBlocks.test.ts`

**Interfaces:**
- Produces:
  - `type TemplateBlock = { key: string; title: string; description: string; elementCount: number; raw: Record<string, unknown> }`
  - `type TemplateBlockGroup = { key: string; title: string; description: string; variants: TemplateBlock[] }`
  - `templateBlockGroups(mergedComponents: unknown): TemplateBlockGroup[]` — accepts `merged_components` as array, `{ components: [...] }`, or an id-keyed record (old `extractTemplateV2MergedComponents`); variants via old `componentVariants` / `templateBlockFromComponent`.
  - `deckTemplateId(slides: readonly { layout_group?: string | null }[], activeSlideId?: string | null): string | null`
  - `TemplateDetail` gains `mergedComponents: unknown` (from `res.merged_components`).
  - `useTemplateBlocks(templateId: MaybeRefOrGetter<string | null>, enabled: MaybeRefOrGetter<boolean>) → { groups: ComputedRef<TemplateBlockGroup[]>; theme: ComputedRef<unknown>; fonts: ComputedRef<unknown>; isPending; isError; refetch }` — vue-query on `templateDetailKey(id)` with `getTemplate`, `enabled` only when id && enabled, `staleTime: Infinity`.

- [ ] **Step 1: Write the failing tests**

```ts
const mc = { components: [
  { id: 'metric_cards', description: 'Cards', variants: [
    { id: 'metric_cards', position: { x: 0, y: 0 }, elements: [{ type: 'text' }, { type: 'text' }] },
    { position: { x: 10, y: 10 }, elements: [{ type: 'image' }] } ] },
  { id: 'title_block', name: 'Title', position: { x: 1, y: 1 }, elements: [{ type: 'text' }] },
] }
it('groups components with their variants', () => {
  const g = templateBlockGroups(mc)
  expect(g.map((x) => x.title)).toEqual(['Metric Cards', 'Title'])
  expect(g[0]!.variants).toHaveLength(2)
  expect(g[0]!.variants[1]!.raw).toMatchObject({ id: 'metric_cards_variant_2', description: 'Cards' })
  expect(g[0]!.variants[0]!.elementCount).toBe(2)
  expect(g[1]!.variants).toHaveLength(1) // no variants → itself
})
it('accepts an array and handles empty input', () => {
  expect(templateBlockGroups(mc.components)).toHaveLength(2)
  expect(templateBlockGroups(null)).toEqual([])
  expect(templateBlockGroups({ components: [] })).toEqual([])
})
it('reads the template id from the active slide, stripping the prefix', () => {
  const slides = [{ id: 'a', layout_group: 'template-v2:modern' }, { id: 'b', layout_group: 'momentum' }]
  expect(deckTemplateId(slides, 'b')).toBe('momentum')
  expect(deckTemplateId(slides, null)).toBe('modern')
})
it('skips smart slides', () => {
  expect(deckTemplateId([{ id: 'a', layout_group: 'smart-html' }, { id: 'b', layout_group: 'pulse' }], 'a')).toBe('pulse')
  expect(deckTemplateId([{ id: 'a', layout_group: 'smart-html' }], 'a')).toBeNull()
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/unit/slide-editor/templateBlocks.test.ts` → FAIL.

- [ ] **Step 3: Implement** `templateBlocks.ts` (port of the named old functions from `PresentationActions.tsx` and `importing/template-v2-import.ts`; header comment), `deckTemplateId` (strip `/^template-v2[:-]/`; ignore `smart-html`, `no`, `blank`, `template-v2`, empty), the `getTemplate` field, and `useTemplateBlocks`.

- [ ] **Step 4: Run tests** → PASS; `npx vitest run tests/unit` (getTemplate consumers unchanged) → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(frontend): template block groups and template id for a deck"` (add the four files).

---

### Task 3: `insertContent` op

**Files:**
- Modify: `frontend/src/slide-editor/ops.ts`
- Test: `frontend/tests/unit/slide-editor/insert.test.ts`

**Interfaces:**
- Consumes: `EditorInsertContent` (Task 1), `TemplateBlock.raw` (Task 2), `appendInsertedContent`, `componentBox`, `selectionForComponentIndexes`, `PASTE_OFFSET`.
- Produces:
  - `type InsertRequest = { content: EditorInsertContent; label: string } | { block: Record<string, unknown>; label: string }`
  - `insertContent(ui: RawUi, req: InsertRequest): OpResult` — `content` → `appendInsertedContent(ui, content.elements ?? [], content.components ?? [], label, false)`; `block` → `appendInsertedContent(ui, [], [block], label, true)`. The new components are those at indexes `>= before.length`. Selection: one new → `{ kind: 'component', componentIndex }`; several → `selectionForComponentIndexes`. Returns null when nothing was added.

Cascade algorithm (not determined by the tests alone):
```ts
// new = appended components; existing = ui.components before the insert
for (let i = 0; i < 20 && new.some(n => existing.some(e => near(componentBox(e), componentBox(n)))); i++)
  shift every new component's position by (+PASTE_OFFSET, +PASTE_OFFSET)
// near(a, b) = |a.x - b.x| <= 2 && |a.y - b.y| <= 2
```

- [ ] **Step 1: Write the failing tests** (fixture `uiTwoComponents()` from `tests/unit/slide-editor/fixtures.ts`)

```ts
it('appends text as a new selected component', () => {
  const ui = uiTwoComponents() as RawUi
  const r = insertContent(ui, { content: { elements: createTextInsertElements('title-block') }, label: 'Title' })!
  expect(readArray(r.ui.components)).toHaveLength(3)
  expect(r.selection).toEqual({ kind: 'component', componentIndex: 2 })
})
it('keeps block data and gives a repeated block a distinct id, shifted 16px', () => {
  const block = { id: 'metric_cards', position: { x: 40, y: 40 }, elements: [{ type: 'text', position: { x: 0, y: 0 }, size: { width: 100, height: 40 }, text: 'A' }] }
  const once = insertContent(uiTwoComponents() as RawUi, { block, label: 'Metric Cards' })!
  const twice = insertContent(once.ui, { block, label: 'Metric Cards' })!
  const [a, b] = readArray(twice.ui.components).slice(2) as Array<{ id: string; position: { x: number; y: number } }>
  expect(a!.id).not.toBe(b!.id)
  expect(b!.position).toEqual({ x: a!.position.x + 16, y: a!.position.y + 16 })
  expect((a as any).elements[0].text).toBe('A')
})
it('does not shift when the spot is free', () => {
  const r = insertContent({ components: [] } as RawUi, { content: { elements: createElementInsertElements('vector-rectangle') }, label: 'Rectangle' })!
  expect(componentBox(readArray(r.ui.components)[0] as any)).toMatchObject({ x: 134, y: 134 })
})
it('returns null for empty content', () => {
  expect(insertContent(uiTwoComponents() as RawUi, { content: {}, label: 'x' })).toBeNull()
})
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/slide-editor/insert.test.ts` → FAIL.
- [ ] **Step 3: Implement** `insertContent` in `ops.ts`.
- [ ] **Step 4: Run** → PASS; `npx vitest run tests/unit/slide-editor` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(frontend): insertContent op with cascade placement"`.

---

### Task 4: Insert tab wiring (store, tabs, toolbar, auto-switch)

**Files:**
- Modify: `frontend/src/stores/editor.ts:4` — `InspectorTabId = 'element' | 'insert' | 'design' | 'narration'`
- Modify: `frontend/src/components/editor/inspector/tabs.ts` — add `{ id: 'insert', label: 'Insert', icon: Plus, component: defineAsyncComponent(() => import('./insert/InsertTab.vue')) }` after `element`
- Create: `frontend/src/components/editor/inspector/insert/InsertTab.vue` (stub: `<section aria-label="Insert" data-inline-edit-ignore="true" />`; filled in Task 5)
- Modify: `frontend/src/composables/useElementTabAutoSwitch.ts` — `reveal()` returns early when `editor.inspectorTab === 'insert'`
- Modify: `frontend/src/components/editor/FloatingToolbar.vue` — `+` button before Ask
- Modify: `frontend/src/stores/editor.ts` — `openInsert()` action: sets `inspectorTab = 'insert'` and opens the inspector (`inspectorOpen = true`; the existing drawer logic follows `inspectorOpen`)
- Test: `frontend/tests/unit/editor/inspector/elementTabAutoSwitch.test.ts`, `frontend/tests/unit/editor/FloatingToolbar.test.ts` (create if missing)

**Interfaces:**
- Produces: `editor.openInsert(): void`; tab id `'insert'`.

- [ ] **Step 1: Write the failing tests**

```ts
// elementTabAutoSwitch.test.ts
it('stays on the Insert tab when a selection appears', async () => {
  const { selection, editor } = setup()
  editor.inspectorTab = 'insert'
  selection.value = sel
  await nextTick()
  expect(editor.inspectorTab).toBe('insert')
})
// FloatingToolbar.test.ts — mount with pinia, vue-query, router stub, presentation with one template slide active
it('the + button opens the Insert tab', async () => {
  await wrapper.find('button[aria-label="Insert"]').trigger('click')
  expect(editor.inspectorTab).toBe('insert'); expect(editor.inspectorOpen).toBe(true)
})
it('the + button is disabled on a smart slide and while locked', /* aria-disabled / disabled + title */)
```
Disabled titles (exact copy): smart → `Insert is available for template slides`; locked → `Insert is unavailable while the deck is busy`; enabled → `Insert (blocks, text, images, shapes)`.

- [ ] **Step 2: Run** the two test files → FAIL.
- [ ] **Step 3: Implement** the listed modifications. The toolbar button uses the existing `tool` / `active` classes, `Plus` icon `size-[17px]`, `active` while `editor.inspectorOpen && editor.inspectorTab === 'insert'`.
- [ ] **Step 4: Run** → PASS; `npm run check` → PASS (the existing EditorView tab tests may enumerate tabs; update their expected list to include Insert).
- [ ] **Step 5: Commit** — `git commit -m "feat(frontend): Insert inspector tab and toolbar entry"`.

---

### Task 5: InsertTab content

**Files:**
- Modify: `frontend/src/components/editor/inspector/insert/InsertTab.vue`
- Create: `frontend/src/components/editor/inspector/insert/BlockThumb.vue`
- Create: `frontend/src/components/editor/inspector/insert/useInsert.ts`
- Test: `frontend/tests/unit/editor/inspector/InsertTab.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3; `useSlideEditingContext()` (`enabled`, `ui`, `slideId`, `inlineEdit`, `closeInlineEdit`, `commitTo`, `select`); `useEditorStore().locked`; `resolvePresentationTheme(presentation)`; `canvas/ImagePickerDialog.vue` (`v-model:open`, `@pick(src)`); `TemplateSlideHost` (`ui`, `theme`, `fonts`).
- Props (same as ElementTab): `{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }`.
- Produces: `useInsert(ctx: SlideEditing, theme: ComputedRef<TemplateTheme>) → { insert(req: InsertRequest, slideId?: string): Promise<boolean> }` — closes an open inline edit with commit first (`await ctx.closeInlineEdit(true)`), takes `ctx.ui.value` *after* that, runs `insertContent`, then `ctx.commitTo(slideId ?? ctx.slideId.value, next.ui, \`Insert ${label}\`)` and `ctx.select(next.selection)` when the target is still the active slide.
- `BlockThumb.vue` props `{ block: TemplateBlock; theme: unknown; fonts: unknown }`: renders `TemplateSlideHost` with `ui = { components: [block.raw] }` in a 16:9 box scaled to its width; mounts the host only after an `IntersectionObserver` reports it visible.

Layout (top to bottom), each a labelled section like ElementTab's:
1. Header: "Insert" / "Click to add to this slide."
2. **Blocks** — search input (`aria-label="Search blocks"`, filters groups by title/description, case-insensitive); grid of 2 group covers (first variant); clicking a cover inserts that variant; a chevron button (`aria-label="Show variants of <title>"`) expands that group's variants beneath it. States: pending → 4 skeleton tiles; error → `Couldn't load template blocks` + `Retry` button calling `refetch`; no template id or no groups → `This deck's template has no reusable blocks.`
3. **Text** — 3-column tiles from `TEXT_INSERT_ITEMS` (icon + label).
4. **Images** — tiles from `IMAGE_INSERT_ITEMS`; `image` opens the picker; on `pick(src)` inserts `createImageInsertContent('image', theme)` with `elements[0].data = src` into the slide id captured when the tile was clicked.
5. **Shapes** — per `ELEMENT_INSERT_GROUPS` group a sub-label and a 6-column icon grid (`aria-label` = item label).
Every tile is a `<button>` with `aria-label="Insert <label>"`, disabled with the Task 4 titles when `!ctx.enabled.value` (smart / no slide) or `editor.locked`.

- [ ] **Step 1: Write the failing tests** (mount like `ElementTab.test.ts`, with a mocked `getTemplate` via `vi.mock('@/api/outlines', …)`)

```ts
it('inserts a Title as one commit and selects it', async () => {
  await click('Insert Title')
  expect(ctx.commitTo).toHaveBeenCalledWith('s1', expect.anything(), 'Insert Title')
  expect(ctx.select).toHaveBeenCalledWith({ kind: 'component', componentIndex: 2 })
})
it('commits an open inline edit before inserting', async () => {
  // ctx.inlineEdit set; closeInlineEdit mock swaps ctx.ui to a ui with 'Edited' text
  await click('Insert Rectangle')
  expect(ctx.closeInlineEdit).toHaveBeenCalledWith(true)
  expect(JSON.stringify(ctx.commitTo.mock.calls[0][1])).toContain('Edited')
})
it('lists template blocks and inserts a variant', async () => {
  await flushPromises(); expect(wrapper.text()).toContain('Metric Cards')
  await click('Insert Metric Cards'); expect(ctx.commitTo.mock.calls[0][2]).toBe('Insert Metric Cards')
})
it('filters blocks by search', /* type "title" → only Title group */)
it('shows the no-blocks note when the deck has no template slide', /* layout_group smart-html */)
it('shows an error with Retry when the template fails to load', /* getTemplate rejects; Retry calls it again */)
it('disables tiles while locked', /* editor.locked = true → button disabled */)
it('image insert targets the slide it was started on', async () => {
  await click('Insert Image')        // picker opens, slide s1
  ctx.slideId = computed(() => 's2')  // user moved on
  picker.vm.$emit('pick', '/app_data/images/x.png')
  expect(ctx.commitTo.mock.calls[0][0]).toBe('s1')
  expect(JSON.stringify(ctx.commitTo.mock.calls[0][1])).toContain('/app_data/images/x.png')
})
it('cancelling the image picker inserts nothing', /* emit update:open false → commitTo not called */)
```
Note for the stale-slide test: `useInsert` must build from that slide's `ui` — capture `ctx.ui.value` at click time together with the slide id, and use it if the active slide changed.

- [ ] **Step 2: Run** `npx vitest run tests/unit/editor/inspector/InsertTab.test.ts` → FAIL.
- [ ] **Step 3: Implement** `useInsert.ts`, `BlockThumb.vue`, `InsertTab.vue`.
- [ ] **Step 4: Run** → PASS; `npm run check` → PASS.
- [ ] **Step 5: Manual check** — dev stack (`docker compose -f docker-compose.frontend.yml up`), open a deck: insert a Title, a Rectangle, a block variant, an Image via Upload; each is selected, the tab stays on Insert, Ctrl+Z removes it, reload keeps it.
- [ ] **Step 6: Commit** — `git commit -m "feat(frontend): insert tab with template blocks, text, images and shapes"`.

---

### Task 6: e2e

**Files:**
- Modify: `frontend/tests/e2e/mocked.spec.ts` (new tests in `on-slide editing (mocked)`)
- Create: `frontend/tests/e2e/fixtures/template-blocks.json` — `{ id: 'modern', name: 'Modern', layouts: [], theme: null, fonts: null, is_default: true, merged_components: { components: [ { id: 'metric_cards', description: 'Metric cards', variants: [ <one variant with a text element "42%"> ] } ] } }`

Override `GET /api/v1/ppt/template/modern` in `editableApi` for these tests.

- [ ] **Step 1: Write the tests**
  - `insert a Title: selected, persists across reload, undo removes it` — open Insert tab via toolbar `Insert`; click `Insert Title`; expect `selection-overlay` to show a selection; last PATCH has one more component; reload → still there; Ctrl+Z → PATCH back to the original component count.
  - `insert a template block variant` — click `Insert Metric Cards`; last PATCH contains `42%`.
  - `cancelling the image picker inserts nothing` — click `Insert Image`, press Esc; no PATCH recorded.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/mocked.spec.ts -g "insert"` → PASS (they target finished features; if one fails, fix the cause in the owning file, not the test).
- [ ] **Step 3: Run** the full mocked suite `npx playwright test tests/e2e/mocked.spec.ts` → PASS.
- [ ] **Step 4: Commit** — `git commit -m "test(frontend): e2e for inserting elements and blocks"`.
