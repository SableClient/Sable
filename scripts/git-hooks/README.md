# Git Hooks

This directory contains git hooks that enforce quality standards before pushing code.

## Installation

Run the installation script from the repository root:

```bash
./scripts/install-git-hooks.sh
```

This will copy the hooks to `.git/hooks/` and make them executable.

## Hooks

### pre-push

Runs before every `git push` and enforces:
- TypeScript type checking (`npm run typecheck`)
- ESLint checks (`npm run lint`)
- Prettier formatting (`npm run fmt:check`)

If any check fails, the push is blocked. To bypass in emergencies: `git push --no-verify`

## Maintenance

This directory is tracked on the `personal/config` branch to persist across `dev` pulls and merges.
