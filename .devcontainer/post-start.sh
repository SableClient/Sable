#!/usr/bin/env bash
# post-start.sh — runs on EVERY codespace start.
# Fetches upstream changes and re-checks signing (agent may have changed).
set -euo pipefail

SABLE_DIR="/workspaces/Sable"
DOCS_DIR="/workspaces/Sable-Docs"

# ── Fetch upstream for both repos ────────────────────────────────────────────
echo "==> [post-start] Fetching upstream..."
git -C "$SABLE_DIR" fetch upstream --quiet 2>/dev/null && echo "    Sable upstream fetched" || echo "    ⚠ Could not fetch Sable upstream"
git -C "$DOCS_DIR"  fetch upstream --quiet 2>/dev/null && echo "    Docs upstream fetched"  || echo "    ⚠ Could not fetch Docs upstream"

# ── Show how far behind integration is from upstream/dev ─────────────────────
BEHIND=$(git -C "$SABLE_DIR" rev-list --count HEAD..upstream/dev 2>/dev/null || echo "?")
if [ "$BEHIND" != "0" ] && [ "$BEHIND" != "?" ]; then
  echo ""
  echo "  ℹ  Your current branch is $BEHIND commit(s) behind upstream/dev."
  echo "     To sync: git merge upstream/dev   (or: git rebase upstream/dev)"
fi

# ── Re-configure SSH signing if not already set (agent may now be available) ─
CODESPACE_KEY="$HOME/.ssh/codespace_signing_ed25519"
if [ "$(git config --global gpg.format 2>/dev/null)" != "ssh" ]; then
  bash "$SABLE_DIR/.devcontainer/setup-signing.sh" || true
else
  # Verify the signing key is still accessible
  CONFIGURED_KEY=$(git config --global user.signingkey 2>/dev/null || echo "")
  if [ -n "$CONFIGURED_KEY" ]; then
    # If it's a file path (MODE 2), check file exists
    if [[ "$CONFIGURED_KEY" == /* ]]; then
      if [ -f "$CONFIGURED_KEY" ]; then
        echo "  ✓  Commit signing ready (private key file)"
      else
        echo "  ⚠  Signing key file not found: $CONFIGURED_KEY"
        echo "     Re-run: bash .devcontainer/setup-signing.sh"
      fi
    # If it's a public key string (MODE 1), check agent
    else
      if ssh-add -L 2>/dev/null | grep -qF "$CONFIGURED_KEY"; then
        echo "  ✓  Commit signing ready (forwarded agent)"
      else
        echo "  ⚠  Signing key not in SSH agent. YubiKey present?"
        echo "     Re-run: bash .devcontainer/setup-signing.sh"
      fi
    fi
  fi
fi

echo ""
