# Advanced graphics, images and icons

Choose the lightest primitive that gets the look. Native elements (vector,
container, chart, infographic) recolor with themes, export to PPTX, and stay
crisp. Images are for photography and for artwork the primitives can't draw.

## Contents
1. Native shapes (vector, container)
2. Charts
3. Infographics
4. Decorative images and theme-tinted SVGs
5. Editable images and icons (generated per deck)
6. Getting assets: bundled files, uploads, stock, AI generation, icons
7. Color discipline

## 1. Native shapes

`vector`: polygons, lines, arrows, blobs.
- `points` are relative to the parent. A full-bleed background is the polygon
  `(0,0) (1280,0) (1280,720) (0,720)` with `closed: true`.
- Rounded rectangles: use `corner_radii: [r,r,r,r]` on a 4-point polygon, or a
  `container` with `border_radius`.
- Lines and connectors: 2+ points, `closed: false`, a `stroke {color, width,
  dash?, line_cap}`, and `start_marker`/`end_marker` (arrow, stealth, triangle,
  circle, square, diamond).
- Organic shapes: `curve: {"type":"smooth","tension":0.5,"segments":24}` turns
  the polygon into a smooth closed curve, which is good for blobs and waves.
- `shape: "ellipse"`: circles and ellipses from the bounding points.
- Depth: `shadow {color, blur, opacity, offset_x, offset_y}`. Keep it subtle,
  with opacity ≤ 0.15.
- Bleed: points may go past the stage for edge decorations. The validator only
  reports those at info level.

`container`: a styled box (fill, stroke, radius, shadow, padding) with an
optional single `child`. Use it for cards, panels, chips and avatar frames.

## 2. Charts

- Pick `chart_type` for the story: trend → line/area; comparison → bar or
  horizontal_bar; composition → stacked_bar, pie or donut (one series only);
  distribution → scatter; profile → radar.
- **Colors:** set `colors` to the theme's `graph_0..graph_9` values in order. A
  theme change then recolors the series. Set `text_color`, `grid_color` and
  `axis_color` from the template's body text and stroke colors.
- Minimum size is 80×60, but anything readable needs ≥ 400×260. Put charts on a
  soft panel (a `container` with the card or background color and a radius) so
  they don't float.
- The sample `categories`/`series` are what users see in the template preview,
  so make them plausible. The generator replaces them per slide (the schema has
  `chart_type`, `categories` and `series`).

## 3. Infographics

27 types: meters (progress_bar, gauge) and structural diagrams such as timeline,
roadmap, chevron_process, pyramid, funnel, org_chart, mind_map and risk_matrix.
The list is in `element-model.md`. The data shapes, default sizes and "best for"
notes are in `servers/fastapi/utils/infographic_catalog.py`.

- Start from the catalog `example_data` and the `default_size`, then scale the
  size to fill the area. Keep the aspect ratio close to the default.
- `colors`: 3–5 theme colors (`graph_*`, primary, heading). Set `text_color`
  for the slide background, not the shapes. Labels often render outside the
  shapes, and white `text_color` on a light slide hides them.
- Infographic text renders in the renderer's own font, not the template font.
  Check that it doesn't clash.

## 4. Decorative images and theme-tinted SVGs

A decorative image (`decorative: true`) is fixed design: textures, photos baked
into the design, logos, blobs, frames.

- **Single-color SVGs should be theme-tinted.** Add `"color": "#RRGGBB"` (its
  fill) and `"tint": true`. The renderer then draws the SVG as a CSS mask in
  that color, and a theme change can recolor it (`color && (is_icon || tint)` in the renderer). Don't set `is_icon` on decorative
  art: `is_icon: true` makes the backend generate icon queries for it.
  `scripts/migrate-template-svg-tint.mjs` (repo root) can add these flags to
  existing template files in bulk.
- Multi-color or gradient SVGs and raster images keep their baked colors and
  won't follow a theme change, so use them deliberately.
- `fit: cover` plus `focus_x`/`focus_y` (percent, 0–100; default 50 = centered) control cropping. `clip_path`
  (CSS clip-path syntax, e.g. `circle(50%)` or `polygon(...)`) gives shaped
  crops. `border_radius` rounds corners. `opacity` handles washes.

## 5. Editable images and icons

- Editable photo slot: `decorative: false`, `is_icon: false`, a semantic `name`,
  `data: "/static/images/replaceable_template_image.png"`, `fit: "cover"`, and an
  optional `prompt` describing the intended style ("bright office photo, natural
  light"). Each generated deck fetches or generates an image for it.
- Editable icon: `is_icon: true`, `icon_type` (bold/duotone/fill/light/regular/
  thin; match the template's `icon_type`), `data: "/static/icons/placeholder.svg"`,
  and `color` set to the icon color. Icons render as color masks.
- An editable photo turns the layout into an "image layout" for the `n_images`
  steering in `utils/image_target.py`. Give every content-heavy layout family at
  least one variant without an image.

## 6. Getting assets

| need | bundled template (repo files) | user template (database) |
|---|---|---|
| your own SVG or PNG art | Save it in `templates/<dir>/static/<name>.svg` and reference it as `"static/<name>.svg"`. Seeding rewrites that to `/app_data/templates/<id>/static/...`. | `api.py upload-image file.svg` returns a URL; use it as `data`. |
| stock photo | `api.py images-search "query"`, then download the image into `static/` (don't hotlink) | `api.py images-search`, then use the returned URL or upload it |
| AI-generated art | `api.py image-generate "prompt"` (the configured provider; costs money, so ask first), then copy the file into `static/` | `api.py image-generate` returns an `/app_data/...` URL you can use directly |
| icon | `api.py icons-search "growth" --type bold` returns icon SVG URLs | same |

When you draw custom SVG art yourself (waves, blobs, patterns, line
illustrations), write a clean single-color SVG with a `viewBox` and no fixed
`width`/`height`. Then tint it. Check it with `render_layouts.mjs`. A
`broken image` or `asset: 404` line means the path is wrong.

Images must stay license-clean. Stock search results come from the configured
provider (Pexels, Pixabay, ...).

## 7. Color discipline

Themes recolor a template by its colors. Theme retint was designed to map
**exact** hex values: tokens map to tokens, neutrals map between the new
background and text, and other hues rotate. See
`docs/superpowers/specs/2026-11-19-theme-recolor-decorative-svgs-design.md`.
That code has moved around since (check with `git log -S makeColorMapper`), but
the rule that keeps layouts consistent and recolorable is the same either way:

- Use the template's existing colors exactly. `tpl.py style <template>` lists
  them with usage counts. A near-miss like `#1E4CDA` instead of `#1E4CD9` looks
  identical but is a different token.
- Chart and infographic `colors` come from the theme's `graph_*` values.
- Ask whether a text color reads on its background before you ship. White on a
  light card is the most common silent failure, and only looking at the render
  catches it.
