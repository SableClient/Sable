# Sable – GitHub Copilot Instructions

Universal rules that apply to every session. Detailed guidance lives in `.github/instructions/` and `AGENTS.md`.

## Core Rules

- **Never commit directly to `dev` or `integration`.** All work goes on a dedicated branch (`fix/…`, `feat/…`, `chore/…`, etc.).
- Use short, scoped commit messages: `type(scope): description` (e.g. `fix(timeline): correct scroll anchor on bulk load`).
- Run quality gates in order and fix all failures before committing:
  ```
  pnpm lint && pnpm fmt:check && pnpm typecheck && pnpm test:run && pnpm knip && pnpm build
  ```
- No `any` casts without an inline comment explaining why it's unavoidable.
- **No over-engineering**: only make changes directly requested or clearly necessary. Don't add abstractions for one-off operations.
- **Reversible actions only**: ask before deleting files/branches, force-pushing, dropping data, or running `pnpm install` to add/remove packages.
- Do not log or expose access tokens, room keys, or other secrets.
