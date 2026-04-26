---
applyTo: "src/**"
---

## TypeScript & React

- Functional components and hooks only. No class components.
- Proper dependency arrays on `useEffect`, `useCallback`, and `useMemo`.
- Prefer explicit types over inferred types for public/exported function signatures.
- No `any` casts without an inline comment explaining why it's unavoidable.

## Comments & Documentation

- Comments must be **short and purposeful** — explain *why*, not *what*.
- No decorative separator lines (`//------`), no block comments restating the code.
- Do not add docstrings, comments, or type annotations to code that was not changed in the current task.
- Add concise docstrings, comments, and/or type annotations to new or updated code.

## Testing

- Test files live alongside source in `src/` (e.g. `foo.test.ts`). Match the naming convention of existing tests.
- Write Vitest tests for any new utility function, hook, or non-trivial logic.
- Bug fixes should include a regression test where feasible.

## Feature Flags

- Every user-visible new feature must be gated behind a feature flag in `config.json` / `useClientConfig`.
- Flags default to `false` (opt-in) unless the feature is a bug fix or a non-breaking improvement with no regressions.
- Document the flag in `config.json` and in the Sable-Docs documentation repo.
