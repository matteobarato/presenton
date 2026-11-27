# Presenter avatar video placeholder

Narrated decks play a lip-synced presenter (avatar) video on slides whose layout
reserves a slot for it. The slot is an ordinary `image` element tagged
`video_placeholder: true`. There is no special element type.

Code that depends on it:
- `servers/fastapi/services/slide_video_service.py`: `find_video_placeholder`,
  `find_video_placeholder_box`, `presenter_slot_fits`, `default_placeholder_box`
- `servers/fastapi/utils/image_target.py`: holds a deck to `n_videos` by picking
  or swapping layouts that have a placeholder (`has_video`)
- `frontend/src/render/legacy/components/slide-editor/video/video-placeholder.ts`
  and `templateV2AvatarLayersHtmlFragments`: split the slide into the layers
  below and above the video
- Tests: `servers/fastapi/tests/unit/test_bundled_template_video_layouts.py`,
  `test_bundled_template_video_selection.py`, `test_image_target.py`
- Design history: `docs/superpowers/specs/2026-11-18-template-avatar-video-layouts-design.md`

## The contract (the validator enforces all of it)

1. **Exactly one placeholder per layout.**
2. It sits alone in **its own component with id `video_placeholder`** and
   description "Avatar video placeholder".
3. The element:
   ```json
   {"type":"image","position":{"x":0,"y":0},"size":{"width":288,"height":512},
    "data":"/static/images/video-placeholder.png","fit":"cover",
    "decorative":true,"name":"avatar_video","is_icon":false,"video_placeholder":true}
   ```
   - Keep it portrait 9:16. 288×512 is standard; 312×555, 324×576 and 360×640
     also work. Avatar videos are 9:16, so other aspects crop the presenter. Use
     16:9 or 1:1 only on purpose (an inset "video call" style).
   - Keep it `decorative: true`. It never becomes a schema field: the generator
     must not write an image prompt for it.
   - Keep it at least ~200 px in both dimensions. Smaller than that and the face
     is unreadable.
4. The layout `description` contains the phrase **"presenter avatar video"**.
   Selection and tests rely on it.
5. Layer order matters. Components **before** `video_placeholder` paint behind
   the video, and components **after** it paint over the video. Frames,
   backdrops and accent panels go before. Captions or badges that should overlap
   the video's edge go after, but keep them off the face (top ~60% of the slot).
6. The slide must still look intentional when **no video exists yet**. The
   poster image is transparent, so an empty slot shows whatever sits behind it.
   Give the slot a backdrop: an accent panel offset behind it, a soft card, or a
   tinted shape. The `sample` render shows the empty state, and the `avatar`
   render shows a presenter silhouette in the slot.
7. No editable content may sit under or on the slot. The validator warns when a
   content box overlaps it by more than 15%, and the renderer reports "covers
   presenter" when text ink actually overlaps it.

## Layouts without a placeholder

When a deck asks for presenter videos (`n_videos`) and the template has too few
avatar layouts, the backend injects a presenter slot into a free corner of other
slides (`presenter_slot_fits`, with a 24 px margin and a 9:16 slot). A layout
with no free corner can't take an injected presenter. The validator prints
`presenter_corner_free` per layout. Templates should ship real avatar layouts
anyway, because designed slots look far better than bolted-on corners.

## Proven arrangements (adapt them to the template; don't clone them)

| archetype | slot | content |
|---|---|---|
| video left + title/points | x≈96, y≈104, 288×512, accent panel offset +20/+20 behind it | eyebrow, 2-line title, paragraph, 3–4 bullets on the right (x≥520) |
| title + steps + video right | right column x≈896 | numbered steps on the left |
| centered video + side callouts | center x≈496 | 2–3 callout cards each side |
| quote panel + video | slot left or right | large quote, attribution |
| video band + cards | slot at one end of a full-width band | 3 cards beside it |
| derived | the image block of an existing layout swapped for the slot | the layout's own text, kept intact |

The derived pattern often looks most native. Take one of the template's own
image layouts, remove the editable image component, put the `video_placeholder`
component where it was (resized to 9:16 within that area), keep the backdrop
shape, and name the result `<source_id>_pvNN` or `<purpose>_avatar_NNNN`. See
`scripts/template_video_layouts/derive.py` in the repo for the logic that
generated the bundled `_pvNN` layouts.

## How to check one

```bash
servers/fastapi/.venv/bin/python <skill>/scripts/validate_layout.py my.json      # contract
node <skill>/scripts/render_layouts.mjs my.json --fonts-from <template> --variants sample,avatar
```

Then look at both PNGs. Is the empty state intentional? Is the presenter's face
clear of text and badges? Does the slot feel like part of the design?

If you added avatar layouts to a bundled template, run
`test_bundled_template_video_layouts.py`. Its `NEW_PER_TEMPLATE` counts cover
`_pvNN` ids only, so a different id suffix doesn't change that count. Keep the
"exactly one placeholder" and "description mentions presenter avatar video"
invariants either way.
