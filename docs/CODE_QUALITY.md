# Code Quality Guide

This document describes the coding conventions and standards used throughout Sable. Most rules are enforced automatically — read this to understand the _why_ behind them and to get the conventions right the first time.

## Enforcement layers

| Layer                                         | When it runs                        | What it checks                                                                  |
| --------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------- |
| **Pre-commit hook** (`husky` + `lint-staged`) | On every `git commit`               | ESLint (with auto-fix) + Prettier (with auto-fix) on staged files only          |
| **CI — format / lint / typecheck / knip**     | On every PR and push to `dev`       | Prettier format, ESLint, TypeScript (`tsc --noEmit`), Knip dead-code analysis   |
| **CI — tests**                                | On every PR and push to `dev`       | Runs the full vitest suite; fails if any test fails                             |
| **CI — coverage thresholds**                  | On every PR and push to `dev`       | `pnpm test:coverage`; fails if overall coverage drops below the locked baseline |
| **CI — missing tests warning**                | On PRs only (advisory, not failing) | Comments listing changed logic files that have no `.test.` counterpart          |
| **Editor**                                    | As you type                         | ESLint + Prettier via VS Code extensions                                        |

PRs are **not merged** unless all CI quality checks are green. The pre-commit hook auto-fixes formatting and many lint issues for you; if it cannot, the commit is blocked with a clear error message.

To fix all violations in the entire repo at once:

```sh
pnpm run lint:fix
pnpm run fmt
```

---

## TypeScript

### Prefer `type` over `interface`

Use `type` for all type declarations. `interface` is not used in this codebase.

```ts
// ✅ correct
type RoomAvatarProps = {
  roomId: string;
  src?: string;
};

// ❌ incorrect
interface RoomAvatarProps {
  roomId: string;
  src?: string;
}
```

_Rule: `@typescript-eslint/consistent-type-definitions: ['error', 'type']` — auto-fixed on commit._

### Use `import type` for type-only imports

When an import is used only as a type (not a value at runtime), annotate it with `type`.

```ts
// ✅ correct
import { type MatrixClient, MatrixError } from '$types/matrix-sdk';

// ❌ incorrect
import { MatrixClient, MatrixError } from '$types/matrix-sdk';
// (where MatrixClient is only used as a type annotation)
```

_Rule: `@typescript-eslint/consistent-type-imports` with `inline-type-imports` style — auto-fixed on commit._

### Strict null checks

The project uses `strict: true` including `strictNullChecks`. Never use `as X` to work around nullability — handle the null/undefined case explicitly or use optional chaining.

### Enums

Use `enum` (string-valued) for sets of related constants, as it reads better in debug output and is refactor-safe:

```ts
export enum AsyncStatus {
  Idle = 'idle',
  Loading = 'loading',
  Success = 'success',
  Error = 'error',
}
```

---

## Imports

### Ordering

Group imports in this order, with a blank line between each group:

1. **External packages** — `react`, `folds`, `jotai`, `matrix-js-sdk`, etc.
2. **Internal path aliases** — `$types/*`, `$hooks/*`, `$components/*`, `$state/*`, `$utils/*`, `$features/*`, `$pages/*`, `$client/*`
3. **Relative imports** — `./Foo`, `../bar`, `* as css from './style.css'`

```ts
// ✅ correct
import { useState } from 'react';
import { Box, Text } from 'folds';

import { type MatrixClient } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';

import * as css from './style.css';
```

### Path aliases

Always prefer the `$`-prefixed path aliases over relative traversal for anything outside the current component's own directory:

```ts
// ✅ correct
import { useMatrixClient } from '$hooks/useMatrixClient';

// ❌ incorrect
import { useMatrixClient } from '../../../hooks/useMatrixClient';
```

---

## Naming conventions

| Thing                   | Convention                                 | Example                               |
| ----------------------- | ------------------------------------------ | ------------------------------------- |
| React component         | `PascalCase` function                      | `export function RoomAvatar(...)`     |
| Component props type    | `[ComponentName]Props`                     | `type RoomAvatarProps = { ... }`      |
| Custom hook             | `use` prefix, `camelCase`                  | `useMatrixClient`, `useAsyncCallback` |
| Jotai atom (read/write) | `camelCase` + `Atom` suffix                | `nicknamesAtom`, `settingsAtom`       |
| Jotai write-only atom   | `camelCase` + `Atom` suffix                | `setNicknameAtom`                     |
| Jotai atom family       | `camelCase` + `AtomFamily` suffix          | `roomIdToOpenThreadAtomFamily`        |
| Utility function        | `camelCase`                                | `getMemberDisplayName`, `colorMXID`   |
| Enum                    | `PascalCase` (type) + values `PascalCase`  | `AsyncStatus.Loading`                 |
| CSS module file         | `[ComponentName].css.ts` (vanilla-extract) | `RoomAvatar.css.ts`                   |
| File (component)        | `PascalCase.tsx`                           | `RoomAvatar.tsx`                      |
| File (hook/util/state)  | `camelCase.ts`                             | `useMatrixClient.ts`, `colorMXID.ts`  |

---

## React components

### Named exports, not default exports

Use named exports for all components, hooks, and utilities. Default exports make refactoring harder and are disabled by ESLint (`import-x/prefer-default-export: off`).

```ts
// ✅ correct
export function RoomAvatar({ roomId, src }: RoomAvatarProps) { ... }

// ❌ incorrect
export default function RoomAvatar(...) { ... }
```

### Keep components pure and focused

- One component per file (small co-located sub-components are fine, but extract anything reusable)
- Derive values from props/state — avoid storing derived data in separate state
- Put complex logic in custom hooks, not inline inside JSX

### Polymorphic components with `as`

Reusable UI components that need to render as different HTML elements use the `as` helper from `folds`:

```tsx
export const MemberTile = as<'button', MemberTileProps>(
  ({ as: AsMemberTile = 'button', ...props }, ref) => <AsMemberTile {...props} />
);
```

### No inline arrow functions in JSX where avoidable

Handlers that only exist to call another function should be extracted:

```tsx
// ✅ correct
const handleError = useCallback(() => setError(true), []);
<AvatarImage onError={handleError} />

// ❌ avoid for handlers that will cause child re-renders
<AvatarImage onError={() => setError(true)} />
```

---

## State management (Jotai)

State lives in `src/app/state/`. Atoms are the single source of truth — components read via `useAtomValue` and write via writable atoms or `useSetAtom`.

```ts
// state/nicknames.ts
export const nicknamesAtom = atom<Nicknames>({});

// Write atom encapsulates mutation + side effect
export const setNicknameAtom = atom<null, [userId: string, nick: string | undefined, mx: MatrixClient], void>(
  null,
  (get, set, userId, nick, mx) => { ... }
);
```

- **Don't** derive state in multiple components — put derived atoms in the state file
- **Don't** call Matrix SDK directly from components when an atom/hook already wraps it
- **Do** wait for `SyncState.Syncing` before rendering components that depend on account data (see `useSyncState`)

### localStorage access

**Direct `localStorage` calls are banned in `src/app/components/**`and`src/app/features/**`** — ESLint will error. Use one of the two approved patterns instead:

**Reactive state that components read from JSX** → `atomWithLocalStorage` in a state file:

```ts
// src/app/state/myFeature.ts
const baseAtom = atomWithLocalStorage<MyType>(KEY, getLocalStorageItem, setLocalStorageItem);
export const myAtom = atom<MyType, [MyType], void>(
  (get) => get(baseAtom),
  (_get, set, value) => set(baseAtom, value)
);
```

**Values applied directly to DOM refs or needed before React mounts** → plain functions in a state file:

```ts
// src/app/state/myFeature.ts
export const getMyValue = (): string | undefined => localStorage.getItem(MY_KEY) ?? undefined;
export const setMyValue = (v: string): void => {
  localStorage.setItem(MY_KEY, v);
};
```

Use `atomWithLocalStorage` for anything that drives UI renders. Use plain functions for things like Sentry init flags (read before React) or media volume (applied synchronously to a DOM element ref). See [src/app/state/sentryStorage.ts](../src/app/state/sentryStorage.ts) and [src/app/state/mediaVolume.ts](../src/app/state/mediaVolume.ts) for examples.

---

## Styling (vanilla-extract)

Styles live in co-located `*.css.ts` files alongside the component:

```ts
// RoomAvatar.css.ts
import { style } from '@vanilla-extract/css';
export const RoomAvatar = style({ borderRadius: '50%' });
```

```tsx
// RoomAvatar.tsx
import * as css from './RoomAvatar.css';
<div className={css.RoomAvatar} />;
```

- Never use inline `style={{}}` for anything that could be a static class
- Never import global CSS from within component files

---

## Testing

See [TESTING.md](./TESTING.md) for full details. Key conventions:

- Tests live adjacent to the code they test, or under `src/test/` for shared fixtures
- Test files are named `*.test.ts` / `*.test.tsx`
- Use `@testing-library/react` for component tests — test behaviour, not implementation details
- If your change touches logic with a clear input/output, add or update a test

### Coverage thresholds

Coverage thresholds are locked in `vitest.config.ts` and enforced by CI (`pnpm test:coverage`). The numbers reflect the current baseline — **they should only ever be raised, never lowered**. If your PR causes the coverage job to fail, you either need to add tests or check that you haven't deleted an existing test.

### Missing-tests advisory

On every PR, CI checks whether any changed logic files lack a corresponding `.test.*` file and posts a comment listing them. This is **advisory only** — the job does not fail and does not block merging. If your changes don't warrant tests (e.g. a config tweak or a pure UI restyle), just note that in the PR description.

---

## What the linter enforces automatically

These rules run in CI and on every commit (and are auto-fixed when possible):

| Rule                                                                   | Enforced as                   |
| ---------------------------------------------------------------------- | ----------------------------- |
| `@typescript-eslint/consistent-type-definitions`                       | error (auto-fix)              |
| `@typescript-eslint/consistent-type-imports`                           | error (auto-fix)              |
| `@typescript-eslint/no-unused-vars`                                    | error (auto-fix for imports)  |
| `@typescript-eslint/no-shadow`                                         | error                         |
| `react-hooks/rules-of-hooks`                                           | error                         |
| `react-hooks/exhaustive-deps`                                          | error                         |
| `react/no-unstable-nested-components`                                  | error                         |
| No direct `localStorage` in `components/` or `features/`               | error                         |
| Prettier formatting                                                    | error (auto-fix)              |
| Knip (dead exports / unused files)                                     | error                         |
| Coverage thresholds (statements/functions/lines ≥ 1.5%, branches ≥ 1%) | CI error (raise, never lower) |
| Logic files without a `.test.` counterpart                             | CI advisory comment on PR     |
