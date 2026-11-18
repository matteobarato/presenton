# Voice in the footer, Avatar in the sidebar — design

Status: approved in conversation 2026-11-18. Size: small change. Builds on `2026-11-18-notes-voice-tabbed-footer-design.md`.

## Intent
The footer Voice tab currently mixes speech and avatar video. Split by concern: **footer = speaking voice, right sidebar = avatar/video** (deck-wide view plus the current slide's avatar video options).

## Goals
- Footer Voice tab: active slide's voice card (`SlideVoiceSection`) and whole-deck speech: language, generate all notes, generate narration, delete narration, narration progress/counts.
- New sidebar **Avatar** tab (`InspectorTabId` gains `'avatar'`):
  - This slide: `SlideAvatarSection` (placeholder switch, upload/generate/remove video, chip, blockers).
  - Whole deck: portrait (`PortraitCard`), "Generate avatars" with eligibility count and blocker, avatar progress/error, narration language shown read-only (avatars are tied to it).
  - Voice bubble placer (*call*: it is the narrator's on-screen position, so it lives with video, not speech).
- `useDeckNarration` / `useDeckAvatars` are created once in the editor page and provided to both footer and sidebar; `GenerateAvatarsDialog` lives with the Avatar tab.
- Header: "Narration and avatars" item split into a Voice item (`editor.openFooter('voice')`) and an Avatar item (opens the inspector on the Avatar tab).

## Non-goals / anti-goals
- No behaviour change to narration, avatar or bubble logic; components move, they are not rewritten.
- No changes to `servers/nextjs`; no smart-presentation features.
- Not two copies of any control: each control lives in exactly one place.

## Approaches
Only one sensible way: lift the shared deck state above both surfaces and move existing components. Duplicating state per surface would fork the TTS task and avatar run; keeping everything in the footer contradicts the request.

## Design (builder's calls marked *call*)
- Lift provide: the editor page (or `EditorLayout` host) calls `provideDeckNarration` / `provideDeckAvatars`; `VoiceTab` and the new `AvatarTab` only inject (*call*: exact host is the component that already owns `presentation` and `presentationId`).
- Split `DeckNarrationSection`: speech part stays (footer); portrait, avatars, bubble move to a new `DeckAvatarSection` in the Avatar tab. Keep the collapsible/local-storage behaviour per section (*call*: separate storage keys).
- `AvatarTab.vue` registered in `tabs.ts` (lazy, like the others) with an icon from lucide; sidebar tab order Layers, Insert, Design, Avatar (*call*).
- Progress: narration progress in the footer, avatar progress in the Avatar tab.
- Tests: update `VoiceTab.test.ts` (no avatar/portrait/bubble), new `AvatarTab` test, sidebar tabs list, header actions, e2e copy pointing at the right surface.

## Addendum (user request, 2026-11-18): clearer, more elegant Avatar tab
The Avatar tab leads with an **overview card**: whether the platform can generate avatars (Available / Not set up, naming `HEYGEN_API_KEY` and noting uploads still work) and a small table of the four things an avatar is made from (Portrait, Narration, Placeholder, Video), reported for **Deck** and for **Slide N** side by side. Missing items are one-click fixes (add portrait → opens the deck portrait picker; narration → opens the footer Voice tab; placeholder → switches it on). Below it, the **Slide N** card (switch, status, "No video yet" empty state with Generate / Upload) and the **Whole deck** card, all three in the same card style. Narration language stays in the Whole deck card (calls: *Deck* column header, row label "Placeholder", wording kept short to fit the 240px docked inspector).
