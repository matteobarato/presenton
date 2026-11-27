# Template V2 element model

Source of truth: `servers/fastapi/templates/v2/models/elements.py` (Pydantic) and
`layouts.py`. The renderer is `frontend/src/render/legacy/lib/template-v2-json-to-html.ts`.
When this file and the code disagree, the code wins. Read the model file.

## Contents
1. Containers: template → layout → component → element
2. Coordinates and layering
3. Element types (fields that matter)
4. How the content schema is derived (what the generator LLM fills)
5. Naming and length hints
6. Snippets

## 1. Containers

```
template.json
├── id, name, description, thumbnail, icon_type ("bold"|"duotone"|"fill"|"light"|"regular"|"thin")
├── fonts            {"Family Name": "static/Font.ttf" | "/vendor/fonts/..."}
├── theme            {"colors": {primary, background, card, stroke, primary_text,
│                     background_text, graph_0..graph_9}, "fonts": {"textFont": {name, url}}}
├── layouts[]        SlideLayout
└── merged_components[]  MergedComponent {id, description, variants: [Component]}

SlideLayout  {id, description, components: [Component]}     ids unique per template
Component    {id, description, position {x,y}, elements: [SlideElement, ≥1]}   ids unique per layout
```

The API stores the same data in another shape: `layouts: {"layouts": [...]}` and
`merged_components: {"components": [...]}`. `tpl.py`, `validate_layout.py` and
`render_layouts.mjs` accept both.

`merged_components` groups structurally interchangeable components. The editor
uses them for variant swaps, and certified PPTX imports fill them in. For bundled
templates, register every new layout component there; `tpl.py add` does it, and
`test_components_registered` checks it.

## 2. Coordinates and layering

- The stage is a fixed **1280 × 720** px canvas, origin top-left.
- A component's `position` is absolute on the stage. An element's `position` is
  relative to its parent: the component, a `group`, or a `container`'s padding box.
- Children of `flex` and `grid` are positioned by flow layout, so their own
  `position` is ignored. Give each child a `size`.
- **Paint order is array order.** Components later in `layouts[].components` paint
  on top, and so do elements later in a component. Put the background component
  first.
- `rotation` is in degrees around the element's box. `flip_h`/`flip_v` mirror it.

## 3. Element types

Every type takes the common fields `position`, `size`, `rotation`, `flip_h` and
`flip_v`. "Schema" fields drive generation.

| type | key fields | schema fields |
|---|---|---|
| `text` | `runs: [{text, font}]` (or `{type:"latex", latex}`), `font`, `alignment {horizontal: left/center/right/justify, vertical: top/middle/bottom}`, `fill`, `stroke`, `shadow` | `decorative`, `name`, `min_length`, `max_length` |
| `text-list` | `items: [[run, ...], ...]`, `font`, `marker: bullet/number/none`, `gap`, `marker_gap` | `decorative`, `name`, `min_items`, `max_items`, `min_item_length`, `max_item_length` |
| `image` | `data` (URL), `fit: cover/contain/fill`, `focus_x/focus_y` (percent 0–100, default 50), `crop_scale`, `border_radius {tl,tr,bl,br}`, `clip_path`, `opacity`, `color` + `tint` (render as a color mask), `video_placeholder` | `decorative`, `name`, `is_icon`, `icon_type`, `prompt` |
| `container` | `fill`, `stroke`, `border_radius`, `shadow`, `padding {top,right,bottom,left}`, `alignment`, `child` (one element) | none: a styled box. A card is usually a `group` of a `container` and texts. |
| `group` | `children: [...]` (absolutely positioned inside the group) | `name` (becomes an object in the schema) |
| `flex` | `direction: row/column`, `wrap`, `gap`/`row_gap`/`column_gap`, `align_items`, `justify_content` (flex-start/flex-end/center/stretch), `children` | `name`, `min_children`, `max_children`: **a repeatable region** |
| `grid` | `columns`, `rows`, gaps, `align_items`, `justify_items`, `children` | `name`, `min_children`, `max_children`: **a repeatable region** |
| `vector` | `shape: polygon/ellipse`, `points` (≥2, relative to its parent), `closed`, `curve {type:"smooth", tension, segments}`, `corner_radii[]`, `start_marker`/`end_marker`, `fill`, `stroke {color, width, dash, line_cap, line_join}`, `opacity`, `shadow` | optional `name`; vectors are never content |
| `chart` | `chart_type` (bar, horizontal_bar, stacked_bar, horizontal_stacked_bar, line, area, pie, donut, scatter, radar, polar_area), `categories`, `series [{name, values}]`, `colors`, `legend`, `legend_position`, `data_labels: base/mid/top/outside`, `x_axis`/`y_axis`, `*_grid`, `grid_color`, `axis_color`, `text_color`, `title` | `decorative`, `name`. Size ≥ 80×60. Pie and donut keep only the first series. |
| `table` | `columns: [TableCell]` (the header), `rows: [[TableCell]]`, where a cell is `{runs, font, color: Fill, alignment, borders}` | `decorative`, `name`, `min_/max_columns`, `min_/max_rows` |
| `infographic` | `data: {type, ...}`, `colors[]`, `text_color` | `decorative`, `name` |

Shared value objects:
- `Font`: `size`, `family`, `color`, `bold`, `italic`, `underline`, `line_height`
  (a multiplier), `letter_spacing` (px), `ellipsis`, `opacity`.
- `Fill`: `color` (#RRGGBB), `opacity`.
- `Shadow`: `color`, `blur`, `opacity`, `offset_x`, `offset_y`.

Some templates use weight-named families ("Montserrat Bold", "DM Sans Regular")
with `bold: false`. Copy whatever convention the template already uses. Mixing
the two styles renders the wrong weight.

### Infographic types
Meters: `progress_bar` and `gauge` (`data: {type, min_value, max_value, value}`).
Structural types take `data: {type, items: [{heading?, description?, label?, focus?, icon?}], ...}`:
gantt, timeline, roadmap, milestone_timeline, staircase, supply_chain,
stair_step_blocks, maturity_model, pillar_framework, transformation_hub,
diagonal_circles, risk_matrix, chevron_process, radial_cycle, conversion_funnel,
vertical_funnel, pyramid, segmented_wheel, customer_journey, before_after,
impact_effort_matrix, comparison_matrix, org_chart, decision_tree, mind_map.

Exact data shapes, default sizes and examples are in
`servers/fastapi/utils/infographic_catalog.py` (`INFOGRAPHIC_CATALOG`):

```bash
servers/fastapi/.venv/bin/python -c "import sys,json; sys.path.insert(0,'servers/fastapi'); \
from utils.infographic_catalog import INFOGRAPHIC_BY_TYPE as C; print(json.dumps(C['risk_matrix'], indent=1))"
```

Set `text_color` with the slide background in mind. Infographic labels often sit
**outside** the shapes, on the slide itself. White text on a light slide makes
them invisible, and no automated check catches that.

## 4. How the content schema is derived

`templates/v2/schema.py` turns each layout into a JSON schema, and the text model
fills it for every slide:

- Only `text`, `text-list`, `table`, `chart`, `infographic` and `image` elements
  with `decorative: false` become fields. Everything else is fixed design.
- Field names come from `name`. Each component becomes an object keyed by its
  component id.
- A `group` with a `name` becomes a nested object.
- A `flex`/`grid` whose children share the same structure becomes an **array**
  bounded by `min_children`/`max_children`. The hydrator clones or drops children
  to match the generated count. This is how card rows, KPI columns and step lists
  scale. The children must be structurally identical, and their inner names
  repeat by design.
- An editable non-icon `image` gives the slide an `image_prompt`, so the layout
  counts as an *image layout*. With `is_icon: true` it gets an icon query instead.
- `min_length`/`max_length` become `minLength`/`maxLength`. The model writes up to
  `max_length` characters, so the box must hold that worst case. See the max
  render.

Preview the schema:

```bash
servers/fastapi/.venv/bin/python -c "import sys,json; sys.path.insert(0,'servers/fastapi'); \
from templates.v2.schema import get_template_schema; \
print(json.dumps(get_template_schema(json.load(open('LAYOUT_OR_TEMPLATE.json')))['layouts'][0], indent=1))"
```

(`get_template_schema` expects `{"layouts": [...]}`. Wrap a single layout.)

## 5. Naming and length hints

- Layout ids: `snake_case_purpose_NNNN`. Layout selection and media swaps
  (`utils/image_target.py`) match layouts **by the words in the id** after
  stripping media words (image, photo, video, avatar, presenter, ...). Words such
  as table, chart, metric(s), contents/toc and team mark a "special" layout that
  ordinary slides never swap into. An avatar variant of `title_description_image`
  should therefore keep those words, e.g. `title_description_image_pv07` or
  `title_description_avatar_0412`.
- `description` is what the structure LLM reads to choose a layout. State the
  arrangement **and** what content it suits ("three KPI cards with big numbers and
  labels beside a bar chart; quarterly results, growth metrics"). Avatar layouts
  must contain the phrase "presenter avatar video".
- Element `name`s are schema keys. Make them semantic (`main_title`,
  `kpi_value`), unique within a component except inside repeated flex/grid
  children, and stable when you edit a layout.
- Length hints: set `max_length` from what the box holds at its font size. A
  rough capacity is `(box_w / (font_size × 0.55)) × floor(box_h / (font_size ×
  line_height))`. `min_length` is a soft floor, usually 30–50% of `max_length`. The
  sample text in `runs` should itself fall within `[min_length, max_length]`
  (`test_bundled_template_video_layouts` enforces this for avatar layouts).

## 6. Snippets

Text (an editable headline):
```json
{"type":"text","position":{"x":0,"y":0},"size":{"width":696,"height":106},
 "font":{"size":40,"family":"Montserrat","color":"#234CD9","bold":true,"line_height":1.25},
 "alignment":{"horizontal":"left","vertical":"top"},
 "runs":[{"text":"A clear message from the person behind it","font":{"size":40,"family":"Montserrat","color":"#234CD9","bold":true,"line_height":1.25}}],
 "decorative":false,"name":"main_title","min_length":18,"max_length":48}
```

A repeatable card row (a flex of identical groups):
```json
{"type":"flex","position":{"x":0,"y":0},"size":{"width":1152,"height":220},"direction":"row","gap":24,
 "name":"feature_cards","min_children":2,"max_children":4,
 "children":[{"type":"group","size":{"width":270,"height":220},"name":"feature_card","children":[
   {"type":"container","position":{"x":0,"y":0},"size":{"width":270,"height":220},"fill":{"color":"#FFFFFF"},"border_radius":{"tl":12,"tr":12,"bl":12,"br":12}},
   {"type":"text","position":{"x":20,"y":20},"size":{"width":230,"height":30}, "...":"card_title"},
   {"type":"text","position":{"x":20,"y":60},"size":{"width":230,"height":130}, "...":"card_body"}]}]}
```
Set the flex `size` for `max_children` items: the `max` render expands the
repeat to that count and shows whether it still fits.

Full working layouts are in `assets/skeletons/`: avatar split, chart with KPI
cards, and an infographic process.
