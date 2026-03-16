# Testing Guide

Sable uses [Vitest](https://vitest.dev/) as its test runner and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) for component tests. Tests run in a [jsdom](https://github.com/jsdom/jsdom) environment and coverage is collected via V8.

---

## Running tests

```sh
# Watch mode — reruns affected tests on file save (recommended during development)
pnpm test

# Single run — equivalent to what CI runs
pnpm test:run

# With browser UI (interactive results viewer)
pnpm test:ui

# With coverage report
pnpm test:coverage
```

Coverage reports are written to `coverage/`. Open `coverage/index.html` in your browser for the full HTML report.

---

## Writing tests

### Where to put test files

Place test files next to the source file they cover, with a `.test.ts` or `.test.tsx` suffix:

```
src/app/utils/colorMXID.ts
src/app/utils/colorMXID.test.ts

src/app/features/room/RoomTimeline.tsx
src/app/features/room/RoomTimeline.test.tsx
```

### Testing plain utility functions

For pure functions in `src/app/utils/`, no special setup is needed — just import and assert:

```ts
import { describe, it, expect } from 'vitest';
import { bytesToSize } from './common';

describe('bytesToSize', () => {
  it('converts bytes to KB', () => {
    expect(bytesToSize(1500)).toBe('1.5 KB');
  });
});
```

### Testing React components

Use `@testing-library/react` to render components inside the jsdom environment. Query by accessible role/text rather than CSS classes or implementation details:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyButton } from './MyButton';

describe('MyButton', () => {
  it('calls onClick when pressed', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<MyButton onClick={onClick}>Click me</MyButton>);

    await user.click(screen.getByRole('button', { name: 'Click me' }));

    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

### Testing hooks

Use `renderHook` from `@testing-library/react`:

```ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMyHook } from './useMyHook';

describe('useMyHook', () => {
  it('returns the expected initial value', () => {
    const { result } = renderHook(() => useMyHook());
    expect(result.current.value).toBe(0);
  });
});
```

### Mocking

Vitest has Jest-compatible mocking APIs:

```ts
import { vi } from 'vitest';

// Mock a module
vi.mock('./someModule', () => ({ doThing: vi.fn(() => 'mocked') }));

// Spy on a method
const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

// Restore after test
afterEach(() => vi.restoreAllMocks());
```

### Path aliases

All the project's path aliases work inside tests — you can import using `$utils/`, `$components/`, `$features/`, etc., just like in application code.

---

## What to test

Not every file needs tests. Focus on logic that would be painful to debug when broken:

| Worth testing                                   | Less valuable                                  |
| ----------------------------------------------- | ---------------------------------------------- |
| Pure utility functions (`src/app/utils/`)       | Purely presentational components with no logic |
| Custom hooks with non-trivial state transitions | Thin wrappers around third-party APIs          |
| State atoms and reducers                        | Generated or declarative config                |
| Data transformation / formatting functions      |                                                |

When you fix a bug, consider adding a regression test that would have caught it — the description in the test is useful documentation.

---

## CI

`pnpm test:run` is part of the required quality checks and runs on every pull request alongside `lint`, `typecheck`, and `knip`. A PR with failing tests cannot be merged.
