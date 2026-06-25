# Charm – GitHub Copilot Instructions

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

## CSS Cascade Guardrails

- Treat `folds` reset-bearing primitives (`DefaultReset`, `Text`, `Box`, `Scroll`, and similar components that include the shared reset classes) as safe for chrome and structural primitives, but risky for layout-critical content nodes.
- Do **not** put `DefaultReset` on nodes whose own padding, line-height, or text metrics are part of the layout contract, such as editor content nodes, editor placeholder text, message-body text, or jumbo-emoji containers, unless there is a verified need and the cascade is proven safe in production bundles.
- When a surface depends on precise text box metrics, prefer owning those styles directly on a plain DOM element rather than relying on later component rules to beat a reset class in another CSS chunk.
- If a fix requires selector escalation like `&&` only to preserve padding or text metrics against a reset, stop and verify whether the node should stop inheriting the reset-bearing primitive instead.
