# End-to-end tests

Playwright drives a production build served by Vite preview on `:4175` against a throwaway
[Continuwuity](https://continuwuity.org) homeserver started per run. The suite
covers functional flows (login, sync, navigation, timeline) and captures
screenshots for layout regression.

## Requirements

- Docker running (a Continuwuity container is started via testcontainers).

## Running

```sh
pnpm test:e2e                  # functional tests on the host (screenshots skipped)
pnpm test:e2e:docker           # full suite, browser in the pinned container
pnpm test:e2e:docker:update    # regenerate screenshot baselines
pnpm test:e2e:ui               # interactive UI mode
pnpm test:e2e:report           # open the last HTML report
```

Screenshot baselines are rendered in `mcr.microsoft.com/playwright:<version>-noble`,
because font rendering differs between hosts. Regenerate them with
`test:e2e:docker:update`, never on the host. Visual tests skip unless
`PW_TEST_CONNECT_WS_ENDPOINT` is set.

## How it works

`global.setup.ts`:

1. Starts a Continuwuity container with open registration.
2. Registers a bootstrap user and seeds deterministic rooms/messages over the client-server API.
3. Gives each Playwright worker its own identically seeded user and `storageState`,
   isolating sync and crypto state while specs run in parallel.
4. Saves the container id for `global.teardown.ts`.
5. Injects the session into the app's `localStorage` (`matrixSessions` +
   `matrixActiveSession`), so specs start already logged in without driving the
   login UI.

`global.teardown.ts` removes the container after the dependent projects finish.

## Adding a test

Specs live in `tests/e2e/*.spec.ts` and run against both a desktop and a mobile
viewport. The touch project runs touch interactions and permalink navigation;
the narrow mobile project covers the rest of the responsive flows. Assert
behaviour with locators; add `toHaveScreenshot` where a layout baseline is
useful. Screenshot baselines live in `tests/e2e/__screenshots__`.

Notes when adding screenshots:

- Mask dynamic content (`time` elements, the room-intro creation line).
- The message timeline is virtualised, so its item positions shift between runs;
  snapshot the surrounding layout rather than the timeline itself.
- `folds` renders `Text` as `p`, so `getByRole('heading')` will not match titles.
