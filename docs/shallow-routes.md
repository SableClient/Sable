# Shallow routes

Some surfaces should be an overlay on desktop and a full page on mobile: create
room, create space, bug report, navigate, and settings. They are all plain
routes — the URL is the only source of truth — and the presentation is chosen at
render time.

## How it works

`src/app/pages/client/shallowRoute.ts` lists the paths that behave this way. A
route is _shallow_ when it matches one of them, the viewport is not mobile, and
`location.state.backgroundLocation` is set.

- `useOpenShallowRoute()` navigates and records the current location as the
  background. Navigating within the same surface (settings section to settings
  section) keeps the background it was opened over.
- `ClientRouteOutlet` renders the previous outlet while a shallow route is
  active, so the page behind stays mounted.
- `ShallowRouteRenderer` (and `SettingsShallowRouteRenderer`) draw the overlay
  from the persistent layout, since the route element itself is suppressed.
- `useCloseShallowRoute()` returns to the background location, or home.

React Router's data router (`createBrowserRouter`) does not support the
`<Routes location={background}>` trick — descendant `<Routes>` trees cannot use
the data APIs — so the outlet is cached instead.

## Adding a surface

1. Add its path to `SHALLOW_ROUTE_PATHS`.
2. Render `RouteSurface` from the route element. It picks `FormModal` on desktop
   and `FormPage` on mobile, and wires up close for both.
3. Add the path to `ShallowRouteRenderer`.

`FormPage` renders its own desktop sidebar, so `RouteSurface` must only use it
when the surface is _not_ an overlay.
