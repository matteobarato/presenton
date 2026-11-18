# Avatar-ready video layouts for every template

Date: 2026-11-18 · Status: awaiting approval

## Intent
Narrated decks put a presenter avatar video in a placeholder that a slide's layout reserves
(`video_placeholder: true` image element, see `services/slide_video_service.py`). Only the
Momentum template ships layouts that reserve one (5). The other 12 templates get a presenter slot
injected during generation (`utils/image_target.py`). Give every template its own avatar-ready
layouts, so presenter-video slides look designed, not bolted on, and `has_video` layout choice works.

## Goals
- Each of the 13 templates in `templates/*/template.json` gets 6-8 new layouts with a portrait
  avatar placeholder (Momentum: its 5 existing ones stay; add 3 more).
- New layouts look native to the template: its theme colors, fonts, backgrounds, text sizes.
- Structural variety: not the same five arrangements everywhere.
- Layouts remain valid for LLM generation: text elements keep `name`, `min_length`, `max_length`;
  ids unique within the template.

## Non-goals / anti-goals
- No new element type, no schema, editor, backend or export changes. The placeholder is the
  existing tagged `image` element in a component of its own (`video_placeholder` id).
- No "smart" slide features (project CLAUDE.md). No changes to `servers/nextjs`.
- Do not edit or remove existing layouts. Avoid layouts that look fine only with a video present:
  an empty placeholder (transparent poster) must still read as intentional.

## Approaches considered
- A. Hand-author all layouts: best fit, but 65-130 JSON layouts in 15 MB of files; slow, error-prone.
- B. Restyle Momentum's 5 archetypes per template: cheap, but samey.
- **C (chosen). Hybrid:** B's five archetypes as base (video-left + title/points, video-right + steps,
  centered video + callouts, quote panel + video, video band + cards), plus 1-3 per template derived
  from that template's own existing layouts by swapping the image block for the placeholder. Built by a
  script, then visually checked.

## Design
- A generator script (kept out of the shipped product, in `scripts/` or the scratchpad; decide at plan
  time) reads each `template.json`, extracts palette (`theme.colors`), fonts, background and heading/body
  text styles from that template's layouts, and emits layouts + any components they need into `layouts`
  and `merged_components`, matching the shape Momentum's video layouts use.
- Placeholder: 288x512 portrait (variants allowed for other aspect, e.g. 360x640), `fit: cover`,
  `data: /static/images/video-placeholder.png`, `name: avatar_video`, `decorative: true`,
  inside its own component with id `video_placeholder`, so content above it layers over the avatar.
- Layout ids: `<purpose>_<NNNN>` like Momentum's `video_left_title_points_7401`, unique per template.
  Descriptions state "presenter avatar video" so the structure model can pick them.
- Verification: JSON valid; ids unique; `find_video_placeholder` finds exactly one per new layout and
  `presenter_slot_fits` behaves; existing unit tests (`test_default_templates`, `test_templates_v2_schema`,
  `test_image_target`) pass; render each new layout (frontend or fastapi preview) into a contact sheet per
  template and fix overflow, overlap and off-style layouts before committing.

## My calls (change any)
- 6-8 layouts per template; Momentum +3.
- Script-generated JSON, committed as data; the script is not part of the product.
- One placeholder per layout, portrait.
- Template thumbnails and other layouts untouched.

## Left to the builder
Exact coordinates per layout, which existing layouts each template derives from, number per template
within the range, whether the script is committed.
