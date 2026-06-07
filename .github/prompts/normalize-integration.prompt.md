---
name: normalize integration commits
description: Move unique integration commits onto proper branches based on dev
---

Normalize the `integration` branch so it contains no unique feature work.

## Goal

Ensure that all meaningful commits currently present only on `integration` are moved onto appropriate feature/fix/personal branches based on updated `dev`.

`integration` should become a rebuildable branch composed only from `dev` plus explicitly merged branches.

## Required Process

1. Inspect the current git state.
2. Ensure the working tree is clean.
3. Fetch all remotes.
4. Update local `dev` from `upstream/dev`.
5. Push updated `dev` to `origin/dev`.
6. Compare:
   - `integration` vs `dev`
   - `origin/integration` vs `origin/dev`
   - local branches vs `integration`

7. Identify commits that exist only on `integration`.
8. Group unique commits by feature, fix, or purpose.
9. Determine whether each unique commit already belongs to an existing branch.

## Branch Normalization Plan

Before making changes, produce a plan showing:

- unique commits found on `integration`
- suggested destination branch for each commit
- whether to create a new branch or update an existing one
- branch base commit
- cherry-pick order
- likely conflicts
- validation needed per branch

Do not move commits until I confirm the plan.

## Implementation Rules

When approved:

- create a backup branch of `integration` before making changes
- create/update destination branches from latest `dev`
- cherry-pick or recreate commits carefully
- preserve commit history where reasonable
- resolve conflicts intentionally
- do not drop commits silently
- do not make unrelated cleanup changes
- push each resulting branch to `origin`

## Validation

For each created or updated branch:

1. Run appropriate tests/checks.
2. Report failures.
3. Push to `origin` only after validation passes or after I explicitly approve.

After all unique commits are moved:

1. Rebuild `integration` from `dev`.
2. Merge the normalized branches back into `integration`.
3. Confirm `integration` has no unique commits not present on component branches.
4. Push `integration` to `origin/integration` only after approval.

## Important

Do not delete or overwrite unique work.

If any commit purpose is unclear, stop and ask me where it belongs.
