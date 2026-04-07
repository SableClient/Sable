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
# The POWERLEVEL9K_MODE line has no quotes: POWERLEVEL9K_MODE=nerdfont-complete
if [ -f "${HOME}/.p10k.zsh" ]; then
  sed -i "s/POWERLEVEL9K_MODE=.*/POWERLEVEL9K_MODE=compatible/" \
    "${HOME}/.p10k.zsh"
  echo "✓ p10k mode set to compatible"
else
  echo "⚠ ~/.p10k.zsh not found — skipping p10k patch (add it to your dotfiles repo)"
fi

# ── Powerlevel10k — disable instant prompt in VS Code terminal ────────────────
# Instant prompt outputs to the terminal before VS Code injects its shell
# integration script.  This breaks the integration markers that Copilot Chat
# relies on to run commands.  We prepend a one-liner to .zshrc that sets
# POWERLEVEL9K_INSTANT_PROMPT=off whenever $TERM_PROGRAM is "vscode".
# The check is idempotent — safe to run on Codespace resume.
if [ -f "${HOME}/.zshrc" ]; then
  if ! grep -q 'POWERLEVEL9K_INSTANT_PROMPT=off' "${HOME}/.zshrc"; then
    tmp=$(mktemp)
    {
      printf '# Disable P10k instant prompt in VS Code — it fires before shell\n'
      printf '# integration is injected, which breaks Copilot Chat terminal access.\n'
      printf '[[ "$TERM_PROGRAM" == "vscode" ]] && typeset -g POWERLEVEL9K_INSTANT_PROMPT=off\n\n'
      cat "${HOME}/.zshrc"
    } > "$tmp"
    mv "$tmp" "${HOME}/.zshrc"
    echo "✓ P10k instant prompt disabled for VS Code terminal"
  else
    echo "✓ P10k instant prompt VS Code guard already present"
  fi
else
  echo "⚠ ~/.zshrc not found — skipping instant-prompt patch (dotfiles not checked out?)"
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
  EMAIL="$(git config --global user.email 2>/dev/null || echo "evie@gauthier.id")"
  echo "${EMAIL} $(cat "${KEY_FILE}.pub")" > "${ALLOWED_SIGNERS}"
  git config --global gpg.ssh.allowedSignersFile "${ALLOWED_SIGNERS}"

  # Load the key into the ssh-agent so it's available for signing and SSH auth.
  eval "$(ssh-agent -s)" &>/dev/null || true
  ssh-add "${KEY_FILE}"

  echo "✓ Git SSH commit signing configured (${KEY_FILE}.pub)"
fi

# ── SSH auth key ──────────────────────────────────────────────────────────────
# Requires a Codespace user secret named SSH_AUTH_KEY containing a
# passphrase-free SSH private key (ed25519 recommended).
#
# To set up:
#   1. Generate a key: ssh-keygen -t ed25519 -C "codespace auth" -N "" -f ~/.ssh/id_ed25519
#   2. Copy the private key into a GitHub Codespace secret called SSH_AUTH_KEY:
#        github.com/settings/codespaces > Secrets > New secret
#   3. Add the *public* key to ~/.ssh/authorized_keys on your server.
# ----------------------------------------------------------------------------
if [ -n "${SSH_AUTH_KEY:-}" ]; then
  SSH_DIR="${HOME}/.ssh"
  mkdir -p "${SSH_DIR}"
  chmod 700 "${SSH_DIR}"

  AUTH_KEY_FILE="${SSH_DIR}/id_ed25519"
  printf '%s\n' "${SSH_AUTH_KEY}" > "${AUTH_KEY_FILE}"
  chmod 600 "${AUTH_KEY_FILE}"

  ssh-keygen -y -f "${AUTH_KEY_FILE}" > "${AUTH_KEY_FILE}.pub"
  chmod 644 "${AUTH_KEY_FILE}.pub"

  eval "$(ssh-agent -s)" &>/dev/null || true
  ssh-add "${AUTH_KEY_FILE}"

  echo "✓ SSH auth key loaded (${AUTH_KEY_FILE}.pub)"
fi

echo "✓ postCreate complete"
