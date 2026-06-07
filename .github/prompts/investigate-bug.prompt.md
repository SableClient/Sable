# Sable Bug Investigation

You are investigating a bug in the Sable codebase.

Do NOT implement changes yet.

Your task is to perform a root-cause analysis and produce an implementation plan.

## Investigation Requirements

For the issue described below:

1. Identify the relevant code paths.
2. Trace execution flow end-to-end.
3. Identify all major components, hooks, state, events, and side effects involved.
4. Identify likely root causes.
5. Continue investigating beyond the first plausible explanation.
6. Look for:
   - race conditions
   - lifecycle issues
   - state synchronization issues
   - React rendering issues
   - timeline virtualization issues
   - scroll anchoring issues
   - Sliding Sync interactions
   - Progressive Prefetch interactions
   - mobile browser behavior
   - iOS PWA behavior
   - routing/navigation issues
   - event ordering issues

## Architecture Guidelines

Prefer existing patterns already present in the codebase.

Avoid:

- large rewrites
- introducing new architecture unnecessarily
- duplicate logic
- bandaid fixes

Reuse:

- existing hooks
- existing state management
- existing routing/navigation patterns
- existing UI patterns
- existing utility functions

## Issue To Investigate

{{ISSUE_DESCRIPTION}}

## Deliverables

### Summary

- user-visible behavior
- relevant architecture
- affected subsystems

### Root Cause Analysis

For each suspected root cause:

- description
- supporting evidence
- confidence level
- files involved

### Recommended Solution

- preferred solution
- alternative solutions
- tradeoffs

### Implementation Plan

- ordered implementation steps
- minimal architectural changes
- existing patterns to reuse

### Files

List:

- files inspected
- files likely requiring changes
- important functions/classes

### Risks

List:

- edge cases
- testing considerations
- migration concerns

### Implementation Prompt

Produce a follow-up implementation prompt suitable for a smaller coding model.

## Important

Do NOT implement changes.

If information is missing, ask clarifying questions before making assumptions.

If assumptions are necessary, clearly identify them.

Do not stop after finding the first plausible explanation.
