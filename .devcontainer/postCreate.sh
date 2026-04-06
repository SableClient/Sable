#!/bin/bash
# postCreate.sh — runs once after the Codespace container is created (NOT during prebuild).
# Secrets (GIT_SIGNING_KEY, GIT_USER_NAME, GIT_USER_EMAIL) are available here.
set -euo pipefail

# ── Dotfiles (bare git repo, MacStudio branch) ────────────────────────────────
# The dotfiles repo uses the "bare repo in $HOME" pattern.
# We clone a specific branch so we get the VS Code / Codespace-aware config
# (e.g. the P10k instant-prompt guard for $TERM_PROGRAM == "vscode").
DOTFILES_REPO="https://github.com/Just-Insane/dotfiles.git"
DOTFILES_BRANCH="MacStudio"
DOTFILES_DIR="${HOME}/.cfg"

if [ ! -d "${DOTFILES_DIR}" ]; then
  git clone --bare --branch "${DOTFILES_BRANCH}" "${DOTFILES_REPO}" "${DOTFILES_DIR}"

  # Check out dotfiles to $HOME.  Use --force to overwrite any stub files
  # created by the devcontainer (e.g. a default .bashrc).
  git --git-dir="${DOTFILES_DIR}" --work-tree="${HOME}" checkout --force "${DOTFILES_BRANCH}"

  # Don't show untracked files (the whole home dir) in status.
  git --git-dir="${DOTFILES_DIR}" --work-tree="${HOME}" \
    config --local status.showUntrackedFiles no

  echo "✓ Dotfiles checked out from ${DOTFILES_BRANCH}"
else
  # Already exists (e.g. Codespace resumed) — just pull latest.
  git --git-dir="${DOTFILES_DIR}" --work-tree="${HOME}" \
    fetch origin "${DOTFILES_BRANCH}" && \
  git --git-dir="${DOTFILES_DIR}" --work-tree="${HOME}" \
    checkout --force "${DOTFILES_BRANCH}"
  echo "✓ Dotfiles updated"
fi

# ── Powerlevel10k — browser-compatible glyph mode ────────────────────────────
# MesloLGS NF / Nerd Font glyphs are unavailable in browser-based Codespaces.
# Patch .p10k.zsh to use the 'compatible' Unicode symbol set instead, which
# renders correctly with any modern monospace font (e.g. Fira Code via extension).
if [ -f "${HOME}/.p10k.zsh" ]; then
  sed -i "s/POWERLEVEL9K_MODE='nerdfont-v3'/POWERLEVEL9K_MODE='compatible'/" \
    "${HOME}/.p10k.zsh"
  echo "✓ p10k mode set to compatible"
fi

# ── Git identity ──────────────────────────────────────────────────────────────
# Populate from Codespace user secrets if they aren't already set by dotfiles.
if [ -n "${GIT_USER_NAME:-}" ] && [ -z "$(git config --global user.name 2>/dev/null)" ]; then
  git config --global user.name "${GIT_USER_NAME}"
fi

if [ -n "${GIT_USER_EMAIL:-}" ] && [ -z "$(git config --global user.email 2>/dev/null)" ]; then
  git config --global user.email "${GIT_USER_EMAIL}"
fi

# ── Git SSH commit signing ────────────────────────────────────────────────────
# Requires a Codespace user secret named GIT_SIGNING_KEY containing a
# passphrase-free SSH private key (ed25519 recommended).
#
# To set up:
#   1. Generate a key: ssh-keygen -t ed25519 -C "codespace signing" -N "" -f ~/.ssh/signing_key
#   2. Copy the private key into a GitHub Codespace secret called GIT_SIGNING_KEY:
#        github.com/settings/codespaces > Secrets > New secret
#   3. Add the *public* key to your GitHub account as a signing key (not auth key):
#        github.com/settings/keys > New signing key
# ----------------------------------------------------------------------------
if [ -n "${GIT_SIGNING_KEY:-}" ]; then
  SSH_DIR="${HOME}/.ssh"
  mkdir -p "${SSH_DIR}"
  chmod 700 "${SSH_DIR}"

  KEY_FILE="${SSH_DIR}/git_signing_key"
  printf '%s\n' "${GIT_SIGNING_KEY}" > "${KEY_FILE}"
  chmod 600 "${KEY_FILE}"

  # Derive the public key from the private key so the user only stores one secret.
  ssh-keygen -y -f "${KEY_FILE}" > "${KEY_FILE}.pub"
  chmod 644 "${KEY_FILE}.pub"

  # Configure git to use SSH signing.
  git config --global gpg.format ssh
  git config --global user.signingkey "${KEY_FILE}.pub"
  git config --global commit.gpgsign true
  git config --global tag.gpgsign true

  # Allow this key when verifying signatures locally.
  ALLOWED_SIGNERS="${SSH_DIR}/allowed_signers"
  EMAIL="$(git config --global user.email 2>/dev/null || echo "you@example.com")"
  echo "${EMAIL} $(cat "${KEY_FILE}.pub")" > "${ALLOWED_SIGNERS}"
  git config --global gpg.ssh.allowedSignersFile "${ALLOWED_SIGNERS}"

  echo "✓ Git SSH commit signing configured (${KEY_FILE}.pub)"
fi

echo "✓ postCreate complete"
