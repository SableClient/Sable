# Sable – Agent Instructions

Workflow and process rules for AI agents. These complement the universal rules in `.github/copilot-instructions.md`.

---

## Git & Branching

- Never commit directly to `dev` or `integration`.
- Treat `integration` as the fork's active trunk. Day-to-day feature, fix, chore, and documentation branches should start from current `integration` and should target `origin/integration` for review/merge:
  ```
  git fetch origin upstream
  git checkout integration
  git pull --ff-only origin integration
  git checkout -b fix/your-branch integration
  ```
- Keep `dev` as a clean mirror of `upstream/dev`. Do not base normal fork work on `dev`.
- Syncing the `dev` mirror is mechanical and can be automated. It is allowed to hard-reset local `dev` and force-update `origin/dev` because `dev` is not a work branch:
  ```
  git fetch upstream origin
  git checkout dev
  git reset --hard upstream/dev
  git push origin dev --force-with-lease
  ```
- Only branch from `dev` when the user explicitly wants to prepare a PR against upstream:
  ```
  git fetch upstream origin
  git checkout dev
  git reset --hard upstream/dev
  git push origin dev
  git checkout -b fix/upstream-thing dev
  ```
- Pull upstream changes into the fork through explicit sync branches from `integration`; resolve overlap there, then open a PR back to `origin/integration`:
  ```
  git fetch upstream origin
  git checkout integration
  git pull --ff-only origin integration
  git checkout -b sync/upstream-dev-YYYY-MM-DD integration
  git merge upstream/dev
  ```
- Upstream sync branches should be treated as integration work, not upstream PR work:
  - First update the `dev` mirror so `origin/dev` reflects `upstream/dev`.
  - Create `sync/upstream-dev-YYYY-MM-DD` from current `integration`.
  - Merge `upstream/dev` into the sync branch.
  - Resolve conflicts by preserving fork behavior unless upstream is clearly better, more spec-compliant, or explicitly requested.
  - Run the full quality gate.
  - Push the sync branch and open a draft PR targeting `origin/integration`.
  - Do not merge the sync PR until conflicts, overlapping features, and release-note impact have been reviewed.
- When asked to build or refresh `integration`, prompt for which feature/fix/chore branches and upstream sync branch to include. In general, include active fork branches, not `dev`.
- For overlapping upstream/fork features, preserve working `integration` behavior unless the upstream implementation is clearly better, more spec-compliant, or explicitly requested by the user.

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

- Fork-local PRs should normally target `origin/integration`.
- Upstream PRs are optional and should be deliberate, narrow, and based on `dev`/`upstream/dev`.
- Use the PR template (`.github/PULL_REQUEST_TEMPLATE.md`) in full — all checkboxes must be present.
- Descriptions should be short, clear, and human-readable.
- Each PR gets one changeset line (or `fix:` + `feat:` if both are genuinely present; prefer separate PRs otherwise).

### Pre-PR Research

1. For fork-local PRs, search related open and merged PRs/issues on `origin`; also check `upstream` when the change overlaps active upstream work or Matrix spec behavior.
2. For upstream PRs, search related open **and** merged PRs on `upstream` (`SableClient/Sable` and `cinnyapp/cinny`) and `origin`. Summarise findings and ask how to proceed if there is overlap or conflict.
3. Search for related open **issues** on the relevant remote(s). Confirm with the user, then link any related ones in the PR description (`Closes #N` / `Related to #N`).
4. If the PR has a corresponding `SableClient/docs` PR, link both PRs to each other.

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
