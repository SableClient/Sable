#!/usr/bin/env bash
# on-create.sh — runs ONCE when the prebuild image is first built
# Everything here is cached between prebuild refreshes.
set -euo pipefail

echo "==> [on-create] Enabling corepack (pnpm)..."
sudo corepack enable
corepack prepare pnpm@latest --activate

echo "==> [on-create] Configuring pnpm global store..."
pnpm config set store-dir /home/node/.local/share/pnpm/store

echo "==> [on-create] Installing Zola (for Sable-Docs preview)..."
ZOLA_VERSION="0.19.2"
ZOLA_URL="https://github.com/getzola/zola/releases/download/v${ZOLA_VERSION}/zola-v${ZOLA_VERSION}-x86_64-unknown-linux-gnu.tar.gz"
curl -fsSL "$ZOLA_URL" | sudo tar xz -C /usr/local/bin
zola --version

echo "==> [on-create] Done."
