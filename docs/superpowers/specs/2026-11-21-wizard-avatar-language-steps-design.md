# Wizard: Avatar and Language steps — design (short)

Approved 2026-11-21. Small change to the create wizard (`frontend/`, template-based only).

## Intent
Choose the presenter photo and language up front so generation knows whether to create avatar placeholders.

## Flow
Topic → **Avatar** → **Language** → Details → Outline → Preview → **Narration** → Export.

## Behaviour
- **Avatar step (new, optional):** pick a presenter photo (JPEG/PNG/WebP, ≤10 MB, `PortraitHero` look) or skip. The file is held in the draft state (not persisted across reload; same "re-add" note as documents). After `createPresentation` succeeds it is uploaded with `uploadPortrait(id, file)`.
- **Language step (new):** the existing language select moved out of Details. The "documents need a language" rule and focus target move here.
- **Details:** with no avatar photo, the videos option is forced to `'0'` and disabled ("None"), hint "Add an avatar photo to use presenter slides". With a photo it behaves as today (auto/None/count). No photo ⇒ `n_videos: 0` ⇒ no avatar placeholders.
- **Post-Preview step:** renamed Narration; portrait and language setup removed (already chosen); keeps generate, live progress, Settings link.

## Non-goals
Smart-presentation features; changing backend; editing the portrait in the wizard after creation (editor does that).

## Approaches
Hold file in draft and upload after create (chosen: no deck id before create). Rejected: create deck first then upload (breaks the topic → create flow).

## Left to the builder
Step labels/summary copy, `avatarHint` / progress.ts adjustments, test updates.
