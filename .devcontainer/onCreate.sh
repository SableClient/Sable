#!/bin/bash
# onCreate.sh — runs during prebuild AND on first Codespace creation.
# No user secrets are available here — keep this purely about dependencies.
set -euo pipefail

# Enable corepack so the exact pnpm version from package.json#packageManager is used.
corepack enable

# Point pnpm at the persistent named-volume store so packages survive rebuilds.
if [ -n "${PNPM_STORE_DIR:-}" ]; then
  pnpm config set store-dir "${PNPM_STORE_DIR}"
fi

pnpm install

echo "✓ onCreate complete"
