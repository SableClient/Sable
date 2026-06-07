# Sable Architecture Review

You are acting as a senior software architect reviewing a proposed feature or architectural change.

Do NOT implement code.

Your goal is to understand the current architecture and propose the cleanest integration approach.

## Feature / Proposal

{{FEATURE_DESCRIPTION}}

## Investigation Requirements

Review:

- current architecture
- existing components
- state management
- routing/navigation
- data flow
- mobile behavior
- desktop behavior
- existing UX patterns

Identify:

- reusable components
- reusable hooks
- reusable state
- reusable infrastructure

## Evaluation Criteria

Assess:

### User Experience

- discoverability
- usability
- consistency
- accessibility

### Technical Design

- complexity
- maintainability
- scalability
- performance

### Integration

- impact on existing systems
- migration concerns
- compatibility with current architecture

## Deliverables

### Current Architecture Summary

Describe:

- relevant subsystems
- important files
- existing patterns

### Design Options

For each option:

- description
- advantages
- disadvantages
- implementation complexity

### Recommended Approach

Provide:

- preferred solution
- rationale
- tradeoffs

### Implementation Roadmap

Break implementation into phases.

For each phase:

- goals
- affected files
- dependencies

### Risks

Identify:

- technical risks
- UX risks
- maintenance risks

### Implementation Prompt

Produce a follow-up implementation prompt suitable for a smaller coding model.

## Important

Prefer solutions that fit naturally into the existing architecture.

Avoid introducing new frameworks, state management systems, or architectural patterns unless clearly justified.

Favor incremental adoption over large rewrites.
