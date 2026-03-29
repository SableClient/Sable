#!/usr/bin/env bash
# setup-signing.sh — configures SSH commit signing.
# Supports two modes:
#   1. Forwarded SSH agent (VS Code desktop + YubiKey)
#   2. Codespace-local SSH key (browser/web Codespaces)
# Safe to re-run at any time.
set -euo pipefail

SABLE_DIR="/workspaces/Sable"
ALLOWED_SIGNERS_FILE="$HOME/.config/git/allowed_signers"
CODESPACE_KEY="$HOME/.ssh/codespace_signing_ed25519"

# ── MODE 1: Forwarded SSH agent (desktop VS Code) ────────────────────────────
if ssh-add -L &>/dev/null && [ -n "$(ssh-add -L 2>/dev/null)" ]; then
  echo "✓  Detected forwarded SSH agent (desktop VS Code + YubiKey mode)"
  SIGNING_KEY=$(ssh-add -L | head -1)
  KEY_COMMENT=$(echo "$SIGNING_KEY" | awk '{print $NF}')
  echo "   Using key: ...${KEY_COMMENT}"

# ── MODE 2: Codespace-local key (web Codespaces) ─────────────────────────────
else
  echo "ℹ  No forwarded agent (web Codespace mode)"
  
  if [ ! -f "$CODESPACE_KEY" ]; then
    echo "   Generating new Ed25519 signing key..."
    mkdir -p "$HOME/.ssh"
    ssh-keygen -t ed25519 -f "$CODESPACE_KEY" -N "" -C "codespace-signing@$(hostname)"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  🔑  Add this PUBLIC KEY to GitHub as a SIGNING key:"
    echo ""
    cat "${CODESPACE_KEY}.pub"
    echo ""
    echo "  👉  https://github.com/settings/keys → New SSH key"
    echo "      Title: Codespace Signing Key"
    echo "      Key type: Signing Key"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    read -p "Press Enter after adding the key to GitHub..." 
  fi
  
  # Start ssh-agent if not already running and add the key
  if [ -z "${SSH_AUTH_SOCK:-}" ] || ! ssh-add -l &>/dev/null; then
    echo "   Starting SSH agent and loading key..."
    eval "$(ssh-agent -s)" > /dev/null
    ssh-add "$CODESPACE_KEY" 2>/dev/null
    # Persist SSH_AUTH_SOCK for future shells
    echo "export SSH_AUTH_SOCK=$SSH_AUTH_SOCK" >> "$HOME/.bashrc"
    echo "export SSH_AGENT_PID=$SSH_AGENT_PID" >> "$HOME/.bashrc"
  fi
  
  SIGNING_KEY=$(cat "${CODESPACE_KEY}.pub")
  echo "   Using Codespace key: ${CODESPACE_KEY}"
fi

# ── Common: Configure git ────────────────────────────────────────────────────
git config --global gpg.format ssh
git config --global user.signingkey "$SIGNING_KEY"
git config --global commit.gpgsign true
git config --global tag.gpgsign true

# Set up allowed_signers for local verification
USER_EMAIL=$(git config --global user.email 2>/dev/null || echo "")
if [ -n "$USER_EMAIL" ]; then
  mkdir -p "$(dirname "$ALLOWED_SIGNERS_FILE")"
  if [ -f "$ALLOWED_SIGNERS_FILE" ]; then
    grep -v "^$USER_EMAIL " "$ALLOWED_SIGNERS_FILE" > "${ALLOWED_SIGNERS_FILE}.tmp" || true
    mv "${ALLOWED_SIGNERS_FILE}.tmp" "$ALLOWED_SIGNERS_FILE"
  fi
  echo "$USER_EMAIL namespaces=\"git\" $SIGNING_KEY" >> "$ALLOWED_SIGNERS_FILE"
  git config --global gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS_FILE"
  echo "✓  SSH commit signing configured for <$USER_EMAIL>"
else
  echo "⚠  user.email not set globally. Run: git config --global user.email 'you@example.com'"
  echo "   Then re-run: bash .devcontainer/setup-signing.sh"
fi

echo ""
echo "Test signing: git commit --allow-empty -m 'test signing'"
echo "Verify:       git log --show-signature -1"