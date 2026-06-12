---
name: normalize integration tracking
description: Reconcile fork-local branches and PRs with integration as the active trunk
---

Normalize branch tracking around the `integration` trunk.

## Goal

Ensure `integration` remains the fork's active trunk and that fork-local work is represented by clean branches and PRs targeting `integration`.

`dev` is a clean mirror of `upstream/dev`. Do not use it as the base for normal fork-local work.

## Required Process

1. Inspect the current git state.
2. Ensure the working tree is clean.
3. Fetch all remotes.
4. Confirm local `dev`, `origin/dev`, and `upstream/dev` match when upstream mirroring is relevant.
5. Compare:
   - `origin/integration` vs local `integration`
   - open `origin` PR heads vs `origin/integration`
   - local branches vs `integration`
6. Identify branches or PRs that still target `dev`.
7. Identify branches whose code is already present on `integration` but whose ancestry is stale.
8. Group branches by purpose: active feature/fix work, tracking-only PR, upstream sync, release, or obsolete.

## Normalization Plan

Before making changes, produce a plan showing:

- PRs targeting the wrong base
- branches already represented on `integration`
- branches that still contain unique work
- branches that can become tracking-only marker branches
- branches that should remain active implementation branches
- branches that appear obsolete
- required pushes, force-with-lease updates, or deletions

Do not rewrite or delete branches until I confirm the plan.

## Implementation Rules

When approved:

- prefer `integration` as the base for fork-local branches
- use explicit `sync/upstream-dev-YYYY-MM-DD` branches for upstream intake
- use marker commits only for tracking PRs whose code is already on `integration`
- preserve active implementation work on real feature/fix branches
- retarget fork-local PRs to `integration`
- preserve `dev` as the upstream mirror
- do not drop commits silently
- do not make unrelated cleanup changes

## Validation

For each updated branch or PR:

1. Confirm the PR targets `integration`.
2. Confirm tracking-only branches are exactly one marker commit ahead of `origin/integration`.
3. Confirm active implementation branches have an intentional diff against `integration`.
4. Report any merge conflicts, dirty status, or stale remote refs.

After normalization:

1. Show the final open PR summary.
2. Show any branches deleted or left untouched.
3. Show whether `dev`, `origin/dev`, and `upstream/dev` still match.
4. Push only after validation passes or after I explicitly approve known issues.

## Important

Do not delete or overwrite unique work.

If any branch purpose is unclear, stop and ask me where it belongs.
