# Modal routes: one surface per feature

## Problem

Several features are reachable two independent ways, and the trigger decides the
presentation rather than the viewport:

- a **route** that always renders a full page
- a **modal atom** that always renders a centred modal

On a phone the lobby button opens a cramped modal while the route opens a proper
full-screen page — the same form, two experiences. The duplicated chrome that
used to sit either side of this has been collapsed into `FormPage` and
`FormModal`, but the two trigger mechanisms remain.

Affected features:

| Feature | Route | Modal atom |
| --- | --- | --- |
| Create room | `/create-room`, `/home/create` | `createRoomModal` |
| Create space | `/create` | `createSpaceModal` |
| Bug report | `/bug-report` | `bugReportModal` |
| Navigate | `/navigate` | `NavigateModal` |

## Target

The URL is the single source of truth. A route renders as an overlay on desktop
(over whatever was behind it) and as a full page on mobile. This is the pattern
GitHub and Element use.

## Steps

1. **`RouteSurface`** — new component choosing presentation by
   `useScreenSizeContext()`: `FormModal` on desktop, `FormPage` on mobile. Props
   are the union of both (`title`, `subTitle`, `closeLabel`, `onClose`).

2. **Background location in the router** — in `src/app/pages/Router.tsx`, read
   `location.state?.backgroundLocation`. When present, render the route tree
   against the background location and render the overlay route separately, so
   the page behind stays mounted.

3. **Triggers navigate instead of setting atoms** — replace
   `useOpenCreateRoomModal()` and friends with a navigate that passes
   `state={{ backgroundLocation: location }}`. Closing is `navigate(-1)`.

4. **Delete the modal machinery** once no callers remain:
   - `src/app/state/createRoomModal.ts`, `createSpaceModal.ts`
   - `src/app/state/hooks/createRoomModal.ts`, `createSpaceModal.ts`,
     `bugReportModal.ts`
   - the `*ModalRenderer` components and their mounts in `Router.tsx`

5. **Collapse duplicate create-room routes** — `/create-room` and `/home/create`
   both render the same form; keep one.

## Verification

Each step should keep `pnpm test:e2e:docker` green. Worth adding specs for:
opening a surface from the lobby on desktop leaves the lobby mounted behind it;
the same URL on mobile renders full screen; browser back closes it.

## Notes

- `FormPage` renders a desktop sidebar + resizer; `RouteSurface` should only use
  it on mobile, or the sidebar will appear inside the desktop overlay.
- `BugReportForm` is now a pure form (no chrome). `CreateRoomForm` and
  `CreateSpaceForm` were already pure.
