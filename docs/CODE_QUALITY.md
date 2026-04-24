# Code Quality Guide

This document describes the coding conventions and standards used throughout Sable. Most rules are enforced automatically in CI or by local linting. Read this to understand the why behind them and to get the conventions right the first time.

## Enforcement layers

| Layer                                     | When it runs                  | What it checks                                                                  |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| **CI — format / lint / typecheck / knip** | On every PR and push to `dev` | Prettier format, ESLint, TypeScript, Knip dead-code analysis                    |
| **CI — tests**                            | On every PR and push to `dev` | Runs the full Vitest suite; fails if any test fails                             |
| **CI — coverage thresholds**              | On every PR and push to `dev` | `pnpm test:coverage`; fails if overall coverage drops below the locked baseline |
| **CI — missing tests warning**            | On PRs only                   | Comments listing changed logic files that have no `.test.` counterpart          |
| **Editor**                                | As you type                   | ESLint + Prettier via VS Code extensions                                        |

PRs are not merged unless all CI quality checks are green.

To fix all violations in the repo at once:

```sh
pnpm run lint:fix
pnpm run fmt
```

## TypeScript

### Prefer `type` over `interface`

Use `type` for all type declarations. `interface` is not used in this codebase.

```ts
type RoomAvatarProps = {
  roomId: string;
  src?: string;
};
```

Rule: `@typescript-eslint/consistent-type-definitions: ['error', 'type']`

### Use `import type` for type-only imports

When an import is used only as a type and not at runtime, annotate it with `type`.

```ts
import { type MatrixClient, MatrixError } from '$types/matrix-sdk';
```

Rule: `@typescript-eslint/consistent-type-imports` with `inline-type-imports` style.

### Strict null checks

The project uses `strict: true`. Do not paper over nullability with unsafe casts. Handle the null or undefined case explicitly or use optional chaining.

### Enums

Use string enums for sets of related constants when they improve readability and debug output.

## Imports

### Ordering

Group imports in this order, with a blank line between groups:

1. External packages.
2. Internal path aliases.
3. Relative imports.

```ts
import { useState } from 'react';
import { Box, Text } from 'folds';

import { type MatrixClient } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';

import * as css from './RoomAvatar.css';
```

### Path aliases

Prefer the `$`-prefixed aliases over deep relative traversal for anything outside the current directory.

## Naming conventions

| Thing                  | Convention                               | Example                        |
| ---------------------- | ---------------------------------------- | ------------------------------ |
| React component        | `PascalCase` function                    | `RoomAvatar`                   |
| Component props type   | `[ComponentName]Props`                   | `RoomAvatarProps`              |
| Custom hook            | `use` prefix, `camelCase`                | `useMatrixClient`              |
| Jotai atom             | `camelCase` + `Atom` suffix              | `settingsAtom`                 |
| Jotai atom family      | `camelCase` + `AtomFamily` suffix        | `roomIdToOpenThreadAtomFamily` |
| Utility function       | `camelCase`                              | `getMemberDisplayName`         |
| Enum                   | `PascalCase` type + `PascalCase` members | `AsyncStatus.Loading`          |
| CSS module file        | `[ComponentName].css.ts`                 | `RoomAvatar.css.ts`            |
| File (component)       | `PascalCase.tsx`                         | `RoomAvatar.tsx`               |
| File (hook/util/state) | `camelCase.ts`                           | `useMatrixClient.ts`           |

## React components

### Named exports, not default exports

Use named exports for components, hooks, and utilities. Default exports make refactors worse.

### Keep components focused

- One component per file is the default.
- Derive values from props and state instead of duplicating derived state.
- Move non-trivial logic into hooks or state helpers instead of burying it in JSX.

### localStorage access

Direct `localStorage` access is banned in `src/app/components/**` and `src/app/features/**`.

Use one of these patterns instead:

- Reactive state read by JSX: use `atomWithLocalStorage` in a state file.
- Values needed before React mounts or applied directly to DOM refs: use plain helper functions in `src/app/state/`.

Examples:

- [src/app/state/sentryStorage.ts](../src/app/state/sentryStorage.ts)
- [src/app/state/mediaVolume.ts](../src/app/state/mediaVolume.ts)

## Styling

Styles live in co-located `*.css.ts` files alongside the component.

- Avoid inline `style={{}}` for static styling that should be a class.
- Do not import global CSS from component files.

## Testing

See [TESTING.md](./TESTING.md) for the full guide.

- Put tests adjacent to the code they cover, or under `src/test/` for shared fixtures.
- Use `*.test.ts` / `*.test.tsx`.
- Use `@testing-library/react` for component tests.
- If your change touches logic with clear input/output, add or update tests.

### Coverage thresholds

Coverage thresholds are locked in `vitest.config.ts` and enforced by CI. They should only go up, never down.

### Missing-tests advisory

PRs get an advisory comment when changed logic files have no corresponding test file. That job is informational only.

## What the linter enforces automatically

| Rule                                                                    | Enforced as               |
| ----------------------------------------------------------------------- | ------------------------- |
| `@typescript-eslint/consistent-type-definitions`                        | error                     |
| `@typescript-eslint/consistent-type-imports`                            | error                     |
| `@typescript-eslint/no-unused-vars`                                     | error                     |
| `@typescript-eslint/no-shadow`                                          | error                     |
| `react-hooks/rules-of-hooks`                                            | error                     |
| `react-hooks/exhaustive-deps`                                           | error                     |
| `react/no-unstable-nested-components`                                   | error                     |
| No direct `localStorage` in `components/` or `features/`                | error                     |
| Prettier formatting                                                     | error                     |
| Knip dead exports and unused files                                      | error                     |
| Coverage thresholds (statements/functions/lines >= 1.5%, branches >= 1) | CI error                  |
| Logic files without a `.test.` counterpart                              | CI advisory comment on PR |
