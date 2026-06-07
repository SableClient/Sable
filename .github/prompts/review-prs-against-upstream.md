---
name: review open PRs against `upstream`
description: When asked to review open PRs against `upstream`
---

Review open pull requests against the upstream repository.

## Goal

Identify upstream PRs that may be useful, relevant, risky, or conflicting for Sable.

Do not merge anything yet.

## Required Process

1. Inspect configured git remotes.
2. Identify the upstream repository.
3. Fetch latest upstream branches and pull request refs if available.
4. List open upstream PRs.
5. For each relevant PR, inspect:
   - title
   - description
   - changed files
   - commits
   - affected subsystems
   - merge status
   - whether it touches areas Sable has modified

## Review Criteria

For each PR, classify it as:

- likely useful for Sable
- potentially useful but needs review
- risky due to conflicts with Sable changes
- not relevant
- already effectively included
- should be avoided

Pay special attention to PRs touching:

- Matrix SDK usage
- Sliding Sync
- timeline rendering
- room navigation
- mobile behavior
- notifications
- encryption
- build tooling
- dependency updates
- security fixes

## Deliverables

Produce a report with:

1. Summary of open upstream PRs reviewed.
2. Recommended PRs to cherry-pick, merge, or monitor.
3. PRs likely to conflict with Sable.
4. PRs touching files modified by Sable.
5. Suggested order of adoption.
6. Risks and testing requirements.
7. Follow-up implementation prompt for applying selected PRs.

## Important

Do not merge or cherry-pick PRs unless I explicitly ask.

If GitHub CLI or network access is unavailable, explain what information is missing and suggest the exact commands I should run.
