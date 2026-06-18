# Charm Stability Review Notes

This note tracks the current broad repo/app stability pass and the signals added
to support follow-up triage.

## Issue Buckets

Use one of these labels for every finding:

- `fix_now`: clear failure mode or correctness bug; fix in the active PR.
- `needs_logging_first`: plausible bug, but current telemetry is too weak to
  distinguish root cause.
- `sdk_or_platform_limit`: issue appears to sit in browser, OS, or upstream SDK
  behavior outside Charm's direct control.
- `backlog_only`: worthwhile cleanup or hardening, but not justified in the
  current runtime-fix slice.

## Current Focus Areas

- `src/serviceWorkerBootstrap.ts`
- `src/app/hooks/useAppVisibility.ts`
- `src/app/pages/client/BackgroundNotifications.tsx`
- `src/client/initMatrix.ts`
- `src/client/slidingSync.ts`

## Added Runtime Signals

Desktop/PWA idle-resume and recovery paths now emit enough telemetry to separate
these buckets during future Sentry review:

- resume trigger source (`visibilitychange`, `pageshow`, `focus`,
  first-interaction-after-idle)
- service-worker claim requests
- service-worker controller changes
- service-worker watchdog recovery attempts
- background client startup, sync-ready timeout, retry scheduling, and stop
- sync retry attempts on foreground resume
- forced reload reasons before unload

## Local Preventive Checks

This pass keeps the existing required quality gate unchanged and adds a local
Semgrep ruleset aimed at the runtime mistakes implicated by recent stability
findings.

Run it with:

```sh
pnpm run semgrep
```

Current local Semgrep rules cover:

- async DOM event listeners in runtime code
- async timer callbacks in runtime code
- direct `window.location.reload()` in the service-worker bootstrap and client
  reset paths, which must instead go through `reloadWithTelemetry()`

## Follow-up Scope

- Live Sentry issue triage remains the main source for `fix_now` candidates.
- Additional tooling beyond this local Semgrep pass stays follow-up work.
- `dependency-cruiser` is deferred unless this pass turns up import-boundary or
  circular-coupling problems that Semgrep and existing checks do not cover.
