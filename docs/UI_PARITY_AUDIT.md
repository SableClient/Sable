# UI Parity Audit

Baseline:

- Charm: `origin/integration` at `82d80a6ef6b3d3afbd05e1259bb9c5ede501c23b`
- Sable: `upstream/dev` at `e4c4eabac0bff5e3703e50d808f2f26f9c6b5010`

Decision rule:

- Default to Sable parity for visible UI.
- Keep Charm-only changes only when they are clearly non-visual fixes or required Charm behavior.

## Matrix

| Area                                 | Charm path                                                                                                                  | Upstream path | User-visible effect                                                                                      | Action            | Rationale                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| Timeline emoji metrics               | `src/app/styles/CustomHtml.css.ts`                                                                                          | same          | Charm normalized inline emoji to `1em`, making timeline emoji smaller and lower than Sable               | `revert-to-Sable` | Direct match for the reported small/misaligned emoji; keep Charm Twemoji support                      |
| Message row wrappers                 | `src/app/components/message/layout/{layout.css.ts,Modern.tsx,Bubble.tsx}`                                                   | same          | Charm added full-width row wrappers and extra inline padding, changing message rhythm and bubble spacing | `revert-to-Sable` | Restores Sable row layout while leaving message-spacing controls intact                               |
| Picker sidebar stack                 | `src/app/components/emoji-board/EmojiBoard.tsx`                                                                             | same          | Charm moved the emoji-group sidebar stack upward relative to Sable                                       | `revert-to-Sable` | Matches the preferred Sable picker balance from the screenshots                                       |
| Picker authenticated images          | `src/app/components/emoji-board/components/{Item.tsx,Preview.tsx}`                                                          | same          | No intended visual change; ensures emoji/sticker media keep loading under auth                           | `keep-Charm`      | Functional/auth correctness, not a visual divergence to remove                                        |
| Picker emoji glyph wrapper           | `src/app/components/emoji-board/components/styles.css.ts`                                                                   | same          | Gives system emoji a stable render box in picker cells                                                   | `keep-Charm`      | Needed to keep picker glyph sizing stable; consistent with parity goal                                |
| Fixed-cell black squares             | `src/app/plugins/react-custom-html-parser.tsx`, `src/app/styles/CustomHtml.css.ts`                                          | same          | Charm already fixed Twemoji fallback for Wordle-style grids                                              | `keep-Charm`      | User explicitly called out this Charm fix as correct                                                  |
| Room footer safe-area padding        | `src/app/features/room/RoomView.tsx`                                                                                        | same          | Charm adds footer safe-bottom padding and follow-bar placeholder handling                                | `keep-Charm`      | Mobile-shell stability fix, not a parity regression to remove                                         |
| Timeline right/bottom gutters        | `src/app/features/room/RoomTimeline.tsx`                                                                                    | same          | Charm adds drawer-aware and typing-aware outer spacing                                                   | `keep-Charm`      | Existing Charm regression fixes with explicit tests; keep unless a later parity pass proves otherwise |
| Emoji picker portal anchoring        | `src/app/features/room/RoomInput.tsx`                                                                                       | same          | Charm renders the picker through a fixed portal instead of upstream `PopOut` only                        | `needs-merge`     | Visual parity is desirable, but this also carries mobile keyboard/viewport robustness                 |
| Shared compact/display-only previews | `src/app/components/message/{CompactMessagePreview.tsx,DisplayOnlyMessageContent.tsx}`                                      | same          | Charm unifies preview rendering across room/search/bookmark surfaces                                     | `keep-Charm`      | Matches the plan’s shared-seam requirement; review visuals later, not in this batch                   |
| Message menu/mobile menu surfaces    | `src/app/features/room/message/{Message.tsx,MobileMessageMenu.tsx,MobileMessageMenu.css.ts}`                                | same          | Charm adds broader mobile actions and visual changes                                                     | `needs-merge`     | Mixed UI/behavior change; needs a dedicated mobile parity pass                                        |
| Room-adjacent drawers                | `src/app/features/room/{MembersDrawer.tsx,ThreadDrawer.tsx,RoomViewHeader.tsx}`                                             | same          | Visible room shell drift vs Sable                                                                        | `needs-merge`     | Not required for the screenshot regressions; follow-up batch                                          |
| Search/bookmark preview surfaces     | `src/app/features/message-search/*`, `src/app/features/bookmarks/*`, `src/app/components/url-preview/*`                     | same          | Large visible divergence in preview rows and cards                                                       | `needs-merge`     | Follow-up batch after room-surface parity stabilizes                                                  |
| Settings/app shell UI                | `src/app/features/settings/*`, `src/app/components/app-shell/*`, `src/app/components/page/*`, `src/app/features/room-nav/*` | same          | Repo-wide visible drift beyond room surfaces                                                             | `needs-merge`     | Out of scope for this first implementation batch                                                      |

## Batch 1 implemented here

- Restored Sable-style inline emoji sizing/alignment for message bodies while preserving Charm’s Twemoji-backed fixed-cell rendering.
- Restored Sable-style message row layout for modern/bubble message shells.
- Restored Sable-style picker sidebar positioning.

## Batch 2 implemented here

- Restored Sable-style desktop composer picker anchoring in `RoomInput.tsx` by routing the emoji/sticker board back through upstream `PopOut`.
- Restored Sable-style desktop composer emoji/sticker toolbar iconography in `RoomInput.tsx`.
- Kept Charm’s mobile fixed-portal picker path so the composer overlay still behaves correctly with iOS keyboard and visual viewport changes.

## Deliberate keeps in this batch

- Authenticated emoji/sticker media loading.
- Twemoji-backed fixed-cell emoji rendering.
- Room footer safe-area padding and follow-bar placeholder behavior.
- Drawer-aware/typing-aware timeline outer spacing.
- Picker glyph render boxes for stable system-emoji sizing.
- Picker prewarm/focus-trap support required by the retained mobile overlay path.
- Cached/authenticated avatar loading in the reaction viewer.

## Follow-up batches

1. Room-adjacent drawers and header parity
2. Search/bookmark/url-preview parity
3. Settings, app shell, and remaining visible UI parity
