---
name: rebuild integration
description: When asked to rebuild integration, or if there are large numbers of changes to branches
---

Rebuild the `integration` branch safely.

## Goal

Create a fresh `integration` branch from the latest `dev`, then merge selected branches into it in a clean, deliberate order.

`integration` must be treated as disposable. It should not contain unique work that is not present on a feature/fix/personal branch.

## Required Process

1. Inspect the current git state.
2. Ensure the working tree is clean before making changes.
3. Fetch all remotes.
4. Update local `dev` from `upstream/dev`.
5. Push updated `dev` to `origin/dev`.
6. Delete and recreate local `integration` from updated `dev`.
7. Ask me which branches should be included.
8. Always include `personal/config`.
9. Before merging, propose the cleanest merge order.

## Merge Planning

Before performing merges, inspect selected branches and produce a merge plan that considers:

- branch dependencies
- overlapping files
- likely conflict areas
- whether some branches should be merged before others
- whether any branches appear stale and should first be rebased or merged from `dev`
- whether any branch appears to duplicate changes from another branch

Do not merge until you have shown the plan and I confirm.

## Merge Requirements

When merging selected branches:

- preserve feature branch commits where practical
- avoid dropping code or features silently
- resolve conflicts carefully
- explain each conflict before resolving it
- prefer existing branch intent over accidental integration-only state
- do not make unrelated cleanup changes

## Validation

After rebuilding `integration`:

1. Show the final branch graph summary.
2. Show which branches were merged.
3. Show any conflicts resolved.
4. Run appropriate tests/checks.
5. Report failures clearly.
6. Push `integration` to `origin/integration` only after validation passes or after I explicitly approve pushing with known failures.

## Important

Do not create unique feature work directly on `integration`.

If you discover commits that exist only on `integration`, stop and report them instead of deleting them silently.
