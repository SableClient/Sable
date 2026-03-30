# Sable – GitHub Copilot Workspace Instructions

These rules apply to every chat and agent session in this workspace. Follow all instructions below while responding to chat requests.

---

## Git & Branching

- **Never commit directly to `dev` or `integration`.** All work goes on a dedicated branch (`fix/…`, `feat/…`, `chore/…`, etc.).
  - When creating a branch (i.e. if a branch for the requested change doesn't exist or there isn't an existing branch that fits), always sync `upstream/dev` to `origin/dev` and `dev`, and then build the branch from `dev`
- Before building `integration`, always **force-update `dev` from `upstream/dev`**:
  ```
  git fetch upstream && git checkout dev && git reset --hard upstream/dev
  ```
- When asked to build `integration`, **always prompt for which feature/fix branches to include**. In general, all feat/fix/chore/etc branches should be inlcuded.
- Use short, scoped commit messages: `type(scope): description` (e.g. `fix(timeline): correct scroll anchor on bulk load`).

## Quality Gates (must pass before every commit)

Run these in order and fix all failures before committing:

```
pnpm lint        # ESLint
pnpm fmt:check   # Prettier
pnpm typecheck   # TypeScript
pnpm test:run    # Vitest unit tests
pnpm knip        # Dead-code / unused exports check
```

Also run a **production build** and confirm it succeeds with no errors:
```
pnpm build
```

## Pull Requests

- Use the upstream PR template (i.e. [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md)) in full — all checkboxes must be present.
- Descriptions should be short, clear, and human-readable.
- Each PR gets **one changeset line** (or one `fix:` + one `feat:` if both are genuinely present, though prefer separate PRs).
- Before opening a PR, **search for related open and merged PRs on both `upstream` (SableClient/Sable or cinnyapp/cinny) and `origin`**. Review them to understand what else may be in flight that could affect the change. Summarise any findings and ask the user how to proceed if there is overlap or conflict.
- Before opening a PR, **search for related open issues on both `upstream` and `origin`**. If any are related, prompt the user to confirm, then link them in the PR description (`Closes #N` / `Related to #N`).
- If the PR has a corresponding `SableClient/docs` PR, link both PRs to each other in their descriptions.

## Matrix Spec Compliance

- New features and fixes must match the **current Matrix spec** or the relevant **MSC** if the spec change is pending.
- Check how **Element Web**, **FluffyChat**, or **Nheko** implement the same thing before diverging from established client patterns.
- Link the relevant spec section or MSC in the PR description when the change is spec-driven.

## Feature Flags

- Every user-visible new feature must be gated behind a **feature flag** in `config.json` / `useClientConfig`.
- Flags default to `false` (opt-in) unless the feature is a bug fix or a non-breaking improvement with no regressions.
- Document the flag in `config.json` and in the Sable-Docs documentation repo.

## Code Quality

- Code must follow **TypeScript/React best practices**: functional components, hooks, no class components, proper dependency arrays on `useEffect`/`useCallback`/`useMemo`.
- No `any` casts without a comment explaining why it's unavoidable.
- Comments must be **short and purposeful** — explain *why*, not *what*. No decorative separator lines (`//------`), no block comments restating the code.
- Do not add docstrings, comments, or type annotations to code that wasn't changed in the current task.
- Add concise docstrings, comments, and/or type annotations on updating/new code in the current task.
- Prefer explicit types over inferred types for public function signatures.

## Documentation

- When a new feature is added (or an existing one materially changed), **update the Sable-Docs repo** (`/Users/evie/git/Sable-Docs`). Add or update the relevant page under `content/features/` or `content/general/`.
- Keep docs concise — match the style of existing pages.

## Security

- Follow OWASP Top 10 guidance. No `innerHTML`, no `eval`, sanitise all user/Matrix-sourced content before rendering.
- Do not log or expose access tokens, room keys, or other secrets.
- Content Security Policy headers (Caddyfile / Dockerfile) must not be weakened without a documented reason.

## Additional Rules

- **No over-engineering**: only make changes directly requested or clearly necessary. Don't add abstractions for one-off operations.
- **Reversible actions only**: ask before deleting files/branches, force-pushing, or dropping data.
- **Dependency changes** (adding/removing packages) require explicit confirmation before running `pnpm install`.
- When resolving merge conflicts, prefer the version from the feature branch; ask if the intent is ambiguous.
- Test files live alongside source in `src/` (e.g. `*.test.ts`). Match the naming convention of existing tests.
- **Write tests when needed**: any new utility function, hook, or non-trivial logic should have a corresponding Vitest test. Bug fixes should include a regression test where feasible.
