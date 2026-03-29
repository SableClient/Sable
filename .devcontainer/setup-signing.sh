#!/usr/bin/env bash
# setup-signing.sh — configures SSH commit signing via forwarded SSH agent.
# Safe to re-run at any time. YubiKey-backed keys work as long as the
# SSH agent from your local machine is forwarded (VS Code handles this).
set -euo pipefail

SABLE_DIR="/workspaces/Sable"
ALLOWED_SIGNERS_FILE="$HOME/.config/git/allowed_signers"

# Check if SSH agent is available and has keys loaded
if ! ssh-add -L &>/dev/null || [ -z "$(ssh-add -L 2>/dev/null)" ]; then
  echo "⚠  No SSH keys found in the forwarded agent."
  echo "   Make sure your local SSH agent is running and your YubiKey key is loaded."
  echo "   On macOS: ssh-add --apple-use-keychain ~/.ssh/id_ed25519"
  echo "   To retry: bash .devcontainer/setup-signing.sh"
  exit 0
fi

# Pick the first key; if your YubiKey-backed key is not first, adjust:
# e.g. SIGNING_KEY=$(ssh-add -L | grep "cardno:" | head -1)
SIGNING_KEY=$(ssh-add -L | head -1)
KEY_COMMENT=$(echo "$SIGNING_KEY" | awk '{print $NF}')

echo "✓  Found SSH key: ...${KEY_COMMENT}"

# Configure git to use SSH signing
git config --global gpg.format ssh
git config --global user.signingkey "$SIGNING_KEY"
git config --global commit.gpgsign true
git config --global tag.gpgsign true

# Set up allowed_signers for local verification
USER_EMAIL=$(git config --global user.email 2>/dev/null || echo "")
if [ -n "$USER_EMAIL" ]; then
  mkdir -p "$(dirname "$ALLOWED_SIGNERS_FILE")"
  # Remove stale entry for this email if present, then add fresh one
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
echo "Test signing with: git commit --allow-empty -m 'test signing'"
echo "Verify with:       git log --show-signature -1"
