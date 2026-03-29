#!/usr/bin/env bash
# post-create.sh — runs ONCE per new codespace (not cached in prebuild).
# Handles user-specific git setup: remotes, branches, signing.
set -euo pipefail

SABLE_DIR="/workspaces/Sable"
DOCS_DIR="/workspaces/Sable-Docs"

# ── 1. Upstream remotes ───────────────────────────────────────────────────────
echo "==> [post-create] Configuring upstream remotes..."

# Sable: fork = origin (Just-Insane/Sable), upstream = SableClient/Sable
if ! git -C "$SABLE_DIR" remote | grep -q "^upstream$"; then
  git -C "$SABLE_DIR" remote add upstream https://github.com/SableClient/Sable.git
  echo "    Added upstream → SableClient/Sable"
else
  echo "    upstream remote already set"
fi
git -C "$SABLE_DIR" fetch --all --quiet

# Docs: fork = origin (Just-Insane/docs), upstream = SableClient/docs
if ! git -C "$DOCS_DIR" remote | grep -q "^upstream$"; then
  git -C "$DOCS_DIR" remote add upstream https://github.com/SableClient/docs.git
  echo "    [docs] Added upstream → SableClient/docs"
else
  echo "    [docs] upstream remote already set"
fi
git -C "$DOCS_DIR" fetch --all --quiet

# ── 2. Ensure required branches exist ────────────────────────────────────────
echo "==> [post-create] Ensuring branches exist in Sable..."

ensure_branch() {
  local dir="$1"
  local branch="$2"
  local start_point="${3:-HEAD}"
  if git -C "$dir" ls-remote --heads origin "$branch" | grep -q "$branch"; then
    echo "    Branch '$branch' already exists on origin, checking out..."
    git -C "$dir" fetch origin "$branch" --quiet
    if ! git -C "$dir" show-ref --quiet "refs/heads/$branch"; then
      git -C "$dir" branch --track "$branch" "origin/$branch"
    fi
  else
    echo "    Creating branch '$branch' from $start_point and pushing to origin..."
    git -C "$dir" checkout -b "$branch" "$start_point" 2>/dev/null || true
    git -C "$dir" push -u origin "$branch"
  fi
}

# Switch back to integration after branch ops
CURRENT_BRANCH=$(git -C "$SABLE_DIR" rev-parse --abbrev-ref HEAD)

ensure_branch "$SABLE_DIR" "integration" "upstream/dev"
ensure_branch "$SABLE_DIR" "personal/config" "integration"
ensure_branch "$DOCS_DIR"  "integration"     "upstream/main"

# Return to whatever branch we were on
git -C "$SABLE_DIR" checkout "$CURRENT_BRANCH" 2>/dev/null || true

# ── 3. Git signing (SSH via forwarded YubiKey) ────────────────────────────────
echo "==> [post-create] Configuring SSH commit signing..."
bash "$SABLE_DIR/.devcontainer/setup-signing.sh" || true

# ── 4. Install git hooks ──────────────────────────────────────────────────────
echo "==> [post-create] Installing git hooks..."
if [ -f "$SABLE_DIR/scripts/install-git-hooks.sh" ]; then
  bash "$SABLE_DIR/scripts/install-git-hooks.sh"
fi

echo ""
echo "==> [post-create] Done! Open sable.code-workspace for the multi-root view."
echo "    Run '.devcontainer/setup-signing.sh' any time to reconfigure commit signing."
