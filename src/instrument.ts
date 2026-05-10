/* oxlint-disable no-console */
const dsn = import.meta.env.VITE_SENTRY_DSN;
const sentryEnabled = localStorage.getItem("sable_sentry_enabled") === "true";

if (dsn && sentryEnabled) {
  void import("./instrument-runtime");
} else if (!sentryEnabled) {
  console.info("[Sentry] Disabled by user preference");
} else {
  console.info("[Sentry] Disabled - no DSN provided");
}
