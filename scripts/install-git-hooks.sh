#!/bin/zsh
# Setup script: Install git hooks from scripts/git-hooks/

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
SOURCE_DIR="$REPO_ROOT/scripts/git-hooks"

echo "🔧 Installing git hooks..."

# Install pre-push hook
if [ -f "$SOURCE_DIR/pre-push" ]; then
  cp "$SOURCE_DIR/pre-push" "$HOOKS_DIR/pre-push"
  chmod +x "$HOOKS_DIR/pre-push"
  echo "  ✓ Installed pre-push hook"
else
  echo "  ⚠ pre-push hook not found in $SOURCE_DIR"
fi

echo "✅ Git hooks installation complete!"
echo ""
echo "The pre-push hook will now run quality checks (typecheck, lint, format)"
echo "before every git push. To bypass in emergencies, use: git push --no-verify"
