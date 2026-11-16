# Vue frontend — 2b-3: infographic and container editing

Date: 2026-11-16. Status: approved design, awaiting spec review.

## Goal

Give layouts (containers, flex, grid) and infographics in the new Vue
frontend (`/frontend`) the editing that template decks need:

- **Layouts**: gap and item count for flex and grid; fill, stroke, corner
  radius, alignment and padding for containers.
- **Infographics**: value and range for meters, colours, and an items
  dialog for the two item-based types that templates use.

This is the last of three 2b specs: 2b-1 (visual elements, merged), 2b-2
(tables and charts, merged), 2b-3 (this spec).

Why this scope (user, 2026-11-16): the seeded templates contain 1552 flex,
416 container and 82 grid elements, but only 62 infographics, of four
types: `gauge` (32), `progress_bar` (24), `vertical_funnel` (4) and
`maturity_model` (2). The old editor supports about 30 infographic types;
the rest are not reachable from template-based generation.

Constraints (from `CLAUDE.md` and earlier decisions): template-based slides
only, and smart slides get no editing. Do not modify `servers/nextjs`; port
code into `/frontend` as copies. Keep Aera design fidelity (extend
additively). Element controls live in the inspector's Element tab. Reuse
the shared controls (`ColorField`, `NumberField`, `SegmentedControl`,
`SliderField`, `ToggleRow`).

## Scope

In scope:

1. The `layout` and `infographic` selection kinds (§1).
2. Layout section in the Element tab (§2).
3. Infographic section in the Element tab (§3).
4. The Edit items dialog for `vertical_funnel` and `maturity_model`, with a
   live preview and a single commit (§4).

Out of scope:

- Data editors for the other infographic types. They keep rendering and
  get the colour controls only.
- Picking infographic items on the canvas, and editing their text inline.
  The HTML renderer has no per-item targets for this.
- Showing a parent layout's controls while one of its children is selected.
  The parent is reached through the Layer tree.
- Flex direction, wrap, and grid column or row changes. The old editor did
  not offer these.
- A Shadow control in the Layout section. The Appearance section covers it
  (§1).
- Inserting new infographics or layouts. Template blocks in the Insert tab
  cover this.
- `list-view` and `grid-view` layout types.

## Approach

Port and trim, as in 2a, Insert, 2b-1 and 2b-2. Behaviour, limits and
defaults come from the old editor. Patch logic lives in plain TS and is
unit-tested without Vue; the inspector sections are thin views over it.

| From `servers/nextjs/components/slide-editor/` | Use in `/frontend` |
|---|---|
| `layout/layoutItems.ts` | Ported into `slide-editor/model/layoutItems.ts` (import paths only). Add and remove-last item for flex and grid. |
| `layout/layoutResize.ts` | Already ported at `slide-editor/model/layoutResize.ts`. `updateComponentLayoutElement` applies layout changes and resizes the component when the item count changes. |
| `layout/layoutToolbarTarget.ts` | Already ported. `findFirstComponentLayoutElement` finds a component's layout root. |
| `layout/LayoutToolbar.tsx` | Gap semantics only: one value written to `gap`, `column_gap` and `row_gap`, min 0, one decimal. |
| `layout/ContainerToolbarControls.tsx` | Read and patch logic for fill, stroke, radius, alignment and padding, into `slide-editor/layoutOps.ts`. The React UI is not ported. |
| `layout/InfographicToolbarControls.tsx` | Meter value and range patches, and the legacy-field cleanup, into `slide-editor/infographicOps.ts`. |
| `infographics/infographic-editing.ts` | Already ported at `render/legacy/components/slide-editor/infographics/`. Used as is: `infographicToolbarItemStats`, `addInfographicToolbarItem`, `removeLastInfographicToolbarItem`, `normalizeInfographicColors`. |
| `infographics/infographic-sizing.ts` | Ported into `slide-editor/model/infographic-sizing.ts` (import paths only). `resizedInfographicFrame` refits the frame after an item change. |
| `infographics/InfographicEditorContent.tsx` | Semantics only for the two item types: fields, new-item defaults, draft and single save. |

## 1. Selection kinds

`ToolbarKind` gains `layout` and `infographic`:

```
text | list | image | icon | shape | line | video | table | chart | layout | infographic | multi | generic
```

- An element of type `flex`, `grid` or `container` takes `layout`. An
  element of type `infographic` takes `infographic`.
- A selected component is resolved in this order: table, chart (both
  unchanged), infographic, layout, then the existing "lone element" rule.
  The infographic root is the first infographic found depth-first; the
  layout root comes from `findFirstComponentLayoutElement` (a flex or grid
  before a container).
- `dataRoot(ui, sel, kind)` is extended to return the root for `layout` and
  `infographic`, so sections read and patch one resolved element selection.
- `selectionLabel`: "Container", "Flex layout", "Grid layout",
  "Infographic".
- A `group` element is not a layout kind. Groups keep today's behaviour
  ("Group", Ungroup in Arrange).

`appearanceTargets`: when the selection resolves to a layout or infographic
root, that root is the style target (opacity, shadow, flip). Rotation stays
on the component, as today.

## 2. Layout section

`LayoutSection.vue`, shown when `kind === 'layout'`. All patches go through
`EditingActions.run`, so an open inline edit commits first and each change
is one undo step.

Flex and grid:

- **Gap**: a `NumberField`, min 0, rounded to one decimal. Reads `gap`,
  falling back to `column_gap`, then `row_gap`. Writes all three.
- **Items**: the child count, **Add item** and **Remove last item**. Add
  clones the last child (or a default item when empty); remove is disabled
  at zero. There is no upper limit, as in the old editor. Both go through
  `updateComponentLayoutElement`, which grows or shrinks the layout and its
  component.

Container:

- **Fill**: colour (`ColorField`, default `#4A6FF3` when unset) and opacity.
- **Stroke**: colour (default `#1A1F36`), width (min 0) and opacity.
- **Corner radius**: 0 to half the shorter side of the container's box.
  Reads a numeric `border_radius`, or its `radius`, or its `tl`.
- **Alignment**: a 3×3 grid of buttons writing `alignment.horizontal`
  (`left`, `center`, `right`) and `alignment.vertical` (`top`, `middle`,
  `bottom`). Each button has an accessible name ("Center Middle") and
  `aria-pressed`.
- **Padding X / Y**: min 0, step 0.5. X writes `padding.x`, `left` and
  `right`; Y writes `padding.y`, `top` and `bottom`.

`layoutOps.ts` exports a reader (`readLayoutControls(element, box)`) and one
patch builder per control. The value shapes written match the old toolbar
exactly, so decks stay compatible with the old editor and the exporters.

## 3. Infographic section

`InfographicSection.vue`, shown when `kind === 'infographic'`. The type is
`data.type`, falling back to the legacy `infographic_type`.

- **Meters** (`gauge`, `progress_bar`): **Value**, **Min** and **Max**.
  Each change writes the full `{type, value, min_value, max_value}` into
  `data` and removes the legacy top-level `value`, `min_value`, `max_value`
  and `infographic_type`. Value is clamped to the range; a Min above Max
  (or the reverse) is rejected and the field reverts.
- **Colours**: one swatch per entry of `normalizeInfographicColors(colors,
  type)`, in the `ChartColorSwatches` pattern (the commit is anchored at
  picker open, so a drag is one undo step). Writing colours removes the
  legacy `base_color` and `highlight_color`. **Text colour** writes
  `text_color`, for every type.
- **Items** (`vertical_funnel`, `maturity_model`): the count, **Add item**,
  **Remove last item**, and **Edit items…** (§4). Add and remove use the
  ported helpers and limits (1 to 8), except that `maturity_model` stops at
  7, the most the renderer draws. Each also applies
  `resizedInfographicFrame`.
- Any other type shows the colours only.

`infographicOps.ts` holds the meter, colour and item patch builders.

## 4. Edit items dialog

`InfographicItemsDialog.vue`, following `ChartDataDialog`:

- It opens with a draft copy of `data.items`. While open, the slide
  renders from a `draftUi` built from the draft, so the preview is live.
- **Done** commits once: `data.items`, plus `resizedInfographicFrame`. One
  undo step. **Cancel**, Escape or the close button discard the draft.
- The dialog stays open when its own commit lands, and closes when the
  selection changes to another element (as fixed for charts in `875f2011`).
- One row per item, with move up, move down and delete (disabled at the
  minimum). **Add item** is disabled at the maximum.

Fields:

| Type | Fields | New item |
|---|---|---|
| `vertical_funnel` | Value (number), Heading, Description | value = last value − 10 (min 0, 60 when empty), "Stage N", "Add a description." |
| `maturity_model` | Icon, Heading, Description (multiline) | icon copied from the last item, "Level N", empty description |

- A blank or partial number is incomplete (`isCompleteNumericInput`) and
  disables Done, as in the chart dialog.
- Icon opens the existing `IconPickerDialog` and writes `icon.url`,
  keeping `icon.color`.
- Unknown fields on an item (such as `focus` in some template data) are
  preserved untouched.

## Error handling

- A root that disappears (undo, a chat edit re-ids the slide) hides the
  section and closes the dialog, discarding the draft.
- Patch builders return the input unchanged for a wrong element type, so a
  stale call is a no-op.
- Saving reuses the existing slide save path and its error toast.

## Testing

- **Unit (Vitest)**: `layoutOps` (gap, each container patch, radius cap,
  padding shapes); `layoutItems` with `updateComponentLayoutElement` (add
  and remove resize the component); `infographicOps` (meter clamping,
  legacy cleanup, colours, item limits including the maturity cap, frame
  resize); `toolbarKind` (new kinds, resolution order, labels);
  `appearanceTargets` (root as style target).
- **Component**: `LayoutSection` and `InfographicSection` show the right
  controls for flex, grid, container, meter, item and other types;
  `InfographicItemsDialog` (draft isolation, Done commits once, Cancel
  discards, an incomplete number disables Done, add and delete limits).
- **e2e (Playwright)**: change a card's gap and a container's fill; change
  a gauge value; edit funnel items and undo in one step. Needs `E2E_USER`
  and `E2E_PASSWORD`, like the 2b-2 e2e.
- `vue-tsc` and the full Vitest suite pass.
