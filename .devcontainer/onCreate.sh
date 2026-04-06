#!/bin/bash
# onCreate.sh — runs during prebuild AND on first Codespace creation.
# No user secrets are available here — keep this purely about dependencies.
# Everything here is cached in the prebuild snapshot.
set -euo pipefail

# ── pnpm ──────────────────────────────────────────────────────────────────────
# Enable corepack so the exact pnpm version from package.json#packageManager is used.
corepack enable

# Point pnpm at the persistent named-volume store so packages survive rebuilds.
if [ -n "${PNPM_STORE_DIR:-}" ]; then
  pnpm config set store-dir "${PNPM_STORE_DIR}"
fi

pnpm install

# ── Zsh + Oh My Zsh + Powerlevel10k ──────────────────────────────────────────
# Install these during prebuild so the first Codespace start is fast.
# The dotfiles checkout in postCreate.sh will provide .zshrc / .p10k.zsh.

# Install zsh if not already present (base:bookworm ships it, but be safe).
if ! command -v zsh &>/dev/null; then
  sudo apt-get update -qq && sudo apt-get install -y -qq zsh
fi

# Install Oh My Zsh non-interactively (KEEP_ZSHRC=yes preserves any existing .zshrc).
if [ ! -d "${HOME}/.oh-my-zsh" ]; then
  KEEP_ZSHRC=yes CHSH=no RUNZSH=no \
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
fi

# Install Powerlevel10k as an OMZ custom theme.
P10K_DIR="${ZSH_CUSTOM:-${HOME}/.oh-my-zsh/custom}/themes/powerlevel10k"
if [ ! -d "${P10K_DIR}" ]; then
  git clone --depth=1 https://github.com/romkatv/powerlevel10k.git "${P10K_DIR}"
fi

# Make zsh the default shell for this user.
sudo chsh -s "$(command -v zsh)" "$(whoami)"

echo "✓ onCreate complete"
