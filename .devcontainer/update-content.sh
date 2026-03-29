#!/usr/bin/env bash
# update-content.sh — runs on each prebuild refresh AND on new codespace creation.
# The resulting filesystem state is cached in the prebuild snapshot.
set -euo pipefail

echo "==> [update-content] Installing Sable dependencies (pnpm install)..."
pnpm install --frozen-lockfile

echo "==> [update-content] Cloning / updating Sable-Docs..."
DOCS_DIR="/workspaces/Sable-Docs"
if [ -d "$DOCS_DIR/.git" ]; then
  echo "    Docs already present, fetching latest..."
  git -C "$DOCS_DIR" fetch --all
else
  echo "    Cloning Just-Insane/docs → $DOCS_DIR"
  git clone https://github.com/Just-Insane/docs "$DOCS_DIR"
fi

echo "==> [update-content] Done."
