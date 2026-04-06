#!/bin/bash
# postCreate.sh — runs once after the Codespace container is created.
set -euo pipefail

# ── pnpm ──────────────────────────────────────────────────────────────────────
# Enable corepack so the exact pnpm version from package.json#packageManager is used.
corepack enable

# Point pnpm at the persistent named-volume store so packages survive rebuilds.
if [ -n "${PNPM_STORE_DIR:-}" ]; then
  pnpm config set store-dir "${PNPM_STORE_DIR}"
fi

pnpm install

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
