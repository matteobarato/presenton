# Vue frontend — Insert: template blocks and basic elements

Date: 2026-11-07. Status: approved design, awaiting plan.

## Goal

Let users add new content to a template slide in the new Vue frontend
(`/frontend`): the deck template's own reusable **blocks** (components and
their variants) and **basic elements** (text presets, images, shapes and
lines). This is the "insert elements" slice of Phase 2c, pulled forward.

Constraints (from `CLAUDE.md`): template-based slides only; smart slides get
no editing. Do not modify `servers/nextjs`; port code into `/frontend` as
copies. Keep Aera design fidelity (extend additively). Element-level controls
stay in the inspector, not in toolbars over the canvas.

## Scope

In scope:

1. **Insert tab** — a fourth inspector tab, **Insert** (`Plus` icon), next to
   Element, Design and Narration, with sections Blocks · Text · Images ·
   Shapes, styled with Aera's `control-section` / `section-label` patterns.
2. **Toolbar entry** — a `+` button in the floating toolbar opens the
   inspector on the Insert tab (the drawer below 1050px).
3. **Blocks** — components from the deck template's `merged_components`, one
   cover thumbnail per component, expandable to its variants, with a search
   box filtering by name/description.
4. **Text** — Title, Subtitle, Body text, Bullet list, Numbered list, Quote.
5. **Images** — Image (picker first), Image + Text, Image grid.
6. **Shapes** — the four old groups: Basic Shapes, Lines & Arrows, Block
   Arrows, Symbols (47 vector presets).
7. **Click to insert** — a tile click inserts, selects the new content, and
   records one undo step.

Out of scope: charts, tables, infographics, video and equation inserts
(charts/tables/infographics follow 2b, which makes them editable); drag and
drop from the palette; shape fill/stroke styling (rest of 2c). Blocks that
contain charts or infographics still insert and can be moved, resized,
deleted and duplicated as in 2a.

## Approach

Port and trim, as in 2a. The old `servers/nextjs/components/slide-editor/
insert/insert-elements.ts` (2.8k lines) is copied into
`frontend/src/slide-editor/insert/`, keeping only the text, image and vector
builders and the theming helpers (`applyTemplateThemeToElement`,
`themeElements`, `createTextInsertElements`, `createImageInsertContent`,
`createElementInsertElements`, `ELEMENT_INSERT_GROUPS`). The chart,
infographic, table and math builders and their imports are removed. The block
extraction from the old `PresentationActions.tsx`
(`templateBlockFromComponent`, `componentVariants`,
`templateBlockGroupsFromTemplate`) and `extractTemplateV2MergedComponents`
are ported into `insert/templateBlocks.ts`. Insertion reuses the already
ported `model/inserted-content.ts` (`appendInsertedContent`). Every ported
file gets a header comment naming its source and listing the changes.

Inserted content is therefore identical to the old editor's, and decks stay
interchangeable between the two apps.

## Units

```
frontend/src/slide-editor/insert/
  insert-elements.ts   trimmed port: text, image and vector presets, theming
  templateBlocks.ts    template → TemplateBlockGroup[] (component + variants)
frontend/src/slide-editor/ops.ts
  + insertContent(ui, content) → OpResult (new ui, selection of new components)
frontend/src/api/templates.ts
  + useTemplateDetail(templateId) — vue-query, GET /api/v1/ppt/template/{id}
frontend/src/components/editor/inspector/insert/
  InsertTab.vue        the tab; sections, search, gating, empty/error states
  BlockThumb.vue       lazy TemplateSlideHost render of one block variant
  ShapeTile.vue        small SVG preview of a vector preset
frontend/src/components/editor/inspector/tabs.ts   + insert tab
frontend/src/stores/editor.ts                      InspectorTabId += 'insert'
frontend/src/components/editor/FloatingToolbar.vue + `+` button
frontend/public/placeholder.jpg                    copied from servers/nextjs/public
```

### insert-elements.ts (port)

Exports used by the tab:

- `TEXT_INSERT_ITEMS` — `title-block`, `subtitle`, `body-text`,
  `bullet-list`, `numbered-list`, `quote` with labels and lucide icons
  (moved here from the old `PresentationActions.tsx` lists).
- `IMAGE_INSERT_ITEMS` — `image`, `image-text`, `image-grid`.
- `ELEMENT_INSERT_GROUPS` — unchanged.
- `createTextInsertElements(kind, theme)`,
  `createImageInsertContent(kind, theme)`,
  `createElementInsertElements(kind, theme)` — unchanged behaviour.

Theme: the presentation theme converted with the ported
`render/legacy/lib/template-theme.ts`, falling back to
`DEFAULT_TEMPLATE_THEME`.

### templateBlocks.ts

`templateBlockGroups(template: unknown): TemplateBlockGroup[]` where a group
is `{ key, title, description, variants: TemplateBlock[] }` and a block is
`{ key, title, description, elementCount, raw }`. Variant records are merged
over their parent component exactly as the old `componentVariants`
(`id`, `name`, `description` fallbacks). A component without variants yields
one variant: itself.

The template id comes from `presentation.layout.template_id`.

### ops.insertContent

```ts
insertContent(ui: RawUi, content: InsertContent): OpResult
type InsertContent =
  | { kind: 'elements'; elements: RawElement[]; label: string }
  | { kind: 'components'; components: RawComponent[]; label: string; preserve: boolean }
```

- Calls `appendInsertedContent(ui, elements, components, label, preserve)`.
  Blocks use `preserve = true` (component data kept, unique id assigned);
  `image-text` / `image-grid` components use the old non-preserving path.
- **Cascade:** if the bounding box of the new content's top-left coincides
  (±2px) with that of an existing component, the new content shifts by
  `PASTE_OFFSET` (16px) on both axes, repeated until free or 20 tries.
- Returns `selection` covering the new components
  (`selectionForComponentIndexes`).

### InsertTab.vue

- Reads the shared `useSlideEditing` context (created in `EditorView`, as for
  ElementTab). Insert = `commit(result.ui, \`Insert ${label}\`)` then set
  `selection`. The inspector **stays on the Insert tab** after inserting; a
  click on the canvas element switches to Element as in 2a.
- If an inline text edit is open, it is committed first.
- **Image** opens the existing `canvas/ImagePickerDialog.vue`; the image element is
  created with the picked URL; cancel inserts nothing.
- **Gating:** all tiles and the toolbar `+` are disabled (with a tooltip
  saying why) on smart slides, while `editor.locked`, or with no active
  slide.
- **Blocks section:** template detail is fetched only when the tab is open,
  cached per template id. States: loading skeletons; error → inline "Couldn't
  load template blocks" with Retry (other sections unaffected); no
  `template_id` or no components → short note "This deck's template has no
  reusable blocks".
- **Thumbnails:** `BlockThumb` renders a `ui` containing only that variant
  through `TemplateSlideHost` at small scale, with the deck theme. Cover
  thumbnails render when scrolled into view (IntersectionObserver); variant
  thumbnails only for the expanded group.

## Edge cases

- Save failure: handled by `commit` / `applyEdit` as in 2a (toast, refetch,
  selection revalidated).
- Block raw data may carry `variants` / `size`; `appendInsertedContent` and
  the model ignore unknown fields, and `size` is stripped as in the old path.
- Inserting the same variant twice yields two components with distinct ids.
- Slide changes while the image picker is open: the insert goes to the slide
  that was active when the tile was clicked (commands find slides by id; if
  the slide is gone, it no-ops).

## Testing

- **Unit (Vitest):** builders return elements with theme colours applied;
  `templateBlockGroups` on a fixture template (variant merge, id/name
  fallbacks, component without variants, template without components);
  `insertContent` assigns unique ids, cascades on an occupied spot, selects
  the new components; double insert of one variant → distinct ids.
- **Component:** InsertTab renders sections; no-template note; error + Retry;
  tiles disabled when locked or on smart slides; a tile click commits with
  label `Insert <label>`; toolbar `+` opens the Insert tab.
- **e2e (Playwright, mocked):** insert Title → selected → reload → persists;
  insert a block variant; undo removes the insert; Image picker cancel
  inserts nothing.
