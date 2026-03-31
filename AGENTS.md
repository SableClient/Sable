# Sable – Agent Instructions

Workflow and process rules for AI agents. These complement the universal rules in `.github/copilot-instructions.md`.

---

## Git & Branching

- Never commit directly to `dev` or `integration`.
- When creating a branch, first sync `upstream/dev` to `origin/dev` and local `dev`, then branch from `dev`:
  ```
  git fetch upstream
  git checkout dev && git reset --hard upstream/dev
  git push origin dev
  git checkout -b feat/your-branch dev
  ```
- Before building `integration`, always force-update `dev` from `upstream/dev`:
  ```
  git fetch upstream && git checkout dev && git reset --hard upstream/dev
  ```
- When asked to build `integration`, always prompt for which feature/fix/chore branches to include. In general, include all non-`dev` branches.

## Quality Gates

Run these in order and fix all failures before committing:

```
pnpm lint        # ESLint
pnpm fmt:check   # Prettier
pnpm typecheck   # TypeScript
pnpm test:run    # Vitest unit tests
pnpm knip        # Dead-code / unused exports check
pnpm build       # Production build — must succeed with no errors
```

## Pull Requests

- Use the PR template (`.github/PULL_REQUEST_TEMPLATE.md`) in full — all checkboxes must be present.
- Descriptions should be short, clear, and human-readable.
- Each PR gets one changeset line (or `fix:` + `feat:` if both are genuinely present; prefer separate PRs otherwise).

### Pre-PR Research

1. Search for related open **and** merged PRs on `upstream` (`SableClient/Sable` and `cinnyapp/cinny`) and `origin`. Summarise findings and ask how to proceed if there is overlap or conflict.
2. Search for related open **issues** on `upstream` and `origin`. Confirm with the user, then link any related ones in the PR description (`Closes #N` / `Related to #N`).
3. If the PR has a corresponding `SableClient/docs` PR, link both PRs to each other.

## Matrix Spec Compliance

- New features and fixes must match the current Matrix spec, or the relevant MSC if the spec change is pending.
- Check how Element Web, FluffyChat, or Nheko implement the same thing before diverging from established client patterns.
- Link the relevant spec section or MSC in the PR description when the change is spec-driven.

## Documentation

- When a new feature is added (or an existing one materially changed), update the Sable-Docs repo (`/Users/evie/git/Sable-Docs`). Add or update the relevant page under `content/features/` or `content/general/`.
- Keep docs concise — match the style of existing pages.

## Dependency Changes

- Adding or removing packages requires explicit user confirmation before running `pnpm install`.

## Merge Conflicts

- When resolving merge conflicts, prefer the version from the feature branch; ask if the intent is ambiguous.

## Destructive Actions

Always ask before:
- Deleting files or branches (`git branch -D`, `rm`, etc.)
- Force-pushing (`git push --force`)
- Hard-resetting local branches other than `dev`/`integration` (`git reset --hard`)
- Dropping or truncating data
