---
name: refresh integration
description: When asked to refresh integration from selected branches or upstream changes
---

Refresh the `integration` branch safely.

## Goal

Keep `integration` as the fork's active trunk by merging selected fork branches and explicit upstream sync branches in a clean, deliberate order.

`integration` is not disposable. It may contain the fork's canonical product state. Preserve its current behavior unless the user explicitly approves replacing it.

## Required Process

1. Inspect the current git state.
2. Ensure the working tree is clean before making changes.
3. Fetch all remotes.
4. Confirm local `integration` is up to date with `origin/integration`.
5. Confirm local `dev`, `origin/dev`, and `upstream/dev` match when upstream mirroring is relevant.
6. Ask which feature/fix/chore branches and upstream sync branches should be included.
7. Before merging, propose the cleanest merge order.

## Merge Planning

Before performing merges, inspect selected branches and produce a merge plan that considers:

- branch dependencies
- overlapping files
- likely conflict areas
- whether some branches should be merged before others
- whether any branch appears stale and should first be refreshed from `integration`
- whether any branch appears to duplicate changes from another branch
- whether upstream changes overlap fork-local behavior

Do not merge until you have shown the plan and I confirm.

## Merge Requirements

When merging selected branches:

- preserve `integration` behavior unless the branch intentionally changes it
- preserve feature branch commits where practical
- avoid dropping code or features silently
- resolve conflicts carefully
- explain each conflict before resolving it
- prefer existing branch intent over accidental duplicate state
- do not make unrelated cleanup changes

## Upstream Intake

Use explicit upstream sync branches:

1. Start from current `integration`.
2. Merge `upstream/dev`.
3. Resolve conflicts by preserving fork behavior unless upstream is clearly better, more spec-compliant, or explicitly requested.
4. Open a PR from the sync branch to `integration`.

## Validation

After refreshing `integration`:

1. Show the final branch graph summary.
2. Show which branches were merged.
3. Show any conflicts resolved.
4. Run appropriate tests/checks.
5. Report failures clearly.
6. Push `integration` to `origin/integration` only after validation passes or after I explicitly approve pushing with known failures.

## Important

Do not reset `integration` to `dev`.

If you discover unique work whose purpose is unclear, stop and report it instead of deleting it silently.
