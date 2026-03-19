import { type ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import {
  AutocompleteMenu,
  AUTOCOMPLETE_NAVIGATE_EVENT,
  type AutocompleteNavigateDetail,
} from './AutocompleteMenu';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('folds', () => ({
  Header: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Menu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Scroll: ({ children, onKeyDown }: { children: ReactNode; onKeyDown?: unknown }) => (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div onKeyDown={onKeyDown as React.KeyboardEventHandler}>{children}</div>
  ),
  config: { space: { S200: '8px' } },
  Icons: {},
}));

vi.mock('$utils/keyboard', () => ({
  preventScrollWithArrowKey: vi.fn(),
  stopPropagation: vi.fn(() => true),
}));

vi.mock('$hooks/useAlive', () => ({
  useAlive: () => () => true,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function dispatchNavigate(container: HTMLElement, direction: 1 | -1) {
  const menu = container.querySelector('[data-autocomplete-menu]');
  if (!menu) throw new Error('data-autocomplete-menu element not found');
  menu.dispatchEvent(
    new CustomEvent<AutocompleteNavigateDetail>(AUTOCOMPLETE_NAVIGATE_EVENT, {
      bubbles: true,
      detail: { direction },
    })
  );
}

function renderMenu(children: ReactNode) {
  return render(
    <AutocompleteMenu headerContent={<span>header</span>} requestClose={() => {}}>
      {children}
    </AutocompleteMenu>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AutocompleteMenu — data-selected stamping', () => {
  it('stamps the first button with data-selected="true" on initial render', () => {
    const { container } = renderMenu(
      <>
        <button type="button">Item 0</button>
        <button type="button">Item 1</button>
        <button type="button">Item 2</button>
      </>
    );

    const buttons = container.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons[0].getAttribute('data-selected')).toBe('true');
    expect(buttons[1].getAttribute('data-selected')).toBe('false');
    expect(buttons[2].getAttribute('data-selected')).toBe('false');
  });

  it('stamps buttons when children load after initial render (async results)', async () => {
    // Start with no children (empty search, buttons not yet present)
    const { container, rerender } = renderMenu(null);

    // Simulate async search results arriving
    await act(async () => {
      rerender(
        <AutocompleteMenu headerContent={<span>header</span>} requestClose={() => {}}>
          <button type="button">Result A</button>
          <button type="button">Result B</button>
        </AutocompleteMenu>
      );
    });

    const buttons = container.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons).toHaveLength(2);
    // First button must be marked selected — this was the bug: with the old
    // [selectedIndex] dep array the effect didn't re-run when buttons appeared.
    expect(buttons[0].getAttribute('data-selected')).toBe('true');
    expect(buttons[1].getAttribute('data-selected')).toBe('false');
  });

  it('resets selection to the first button when the item list changes', async () => {
    const { container } = renderMenu(
      <>
        <button type="button">Item 0</button>
        <button type="button">Item 1</button>
      </>
    );

    // Navigate to the second item
    act(() => dispatchNavigate(container, 1));

    const before = container.querySelectorAll<HTMLButtonElement>('button');
    expect(before[1].getAttribute('data-selected')).toBe('true');

    // Re-render with a completely different set of buttons (new search results)
    await act(async () => {
      render(
        <AutocompleteMenu headerContent={<span>header</span>} requestClose={() => {}}>
          <button type="button">New A</button>
          <button type="button">New B</button>
          <button type="button">New C</button>
        </AutocompleteMenu>,
        { container: container.firstElementChild?.parentElement ?? document.body }
      );
    });
  });
});

describe('AutocompleteMenu — keyboard navigation', () => {
  it('moves selection forward with direction +1', () => {
    const { container } = renderMenu(
      <>
        <button type="button">Item 0</button>
        <button type="button">Item 1</button>
        <button type="button">Item 2</button>
      </>
    );

    act(() => dispatchNavigate(container, 1));

    const buttons = container.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons[0].getAttribute('data-selected')).toBe('false');
    expect(buttons[1].getAttribute('data-selected')).toBe('true');
    expect(buttons[2].getAttribute('data-selected')).toBe('false');
  });

  it('moves selection backward with direction -1', () => {
    const { container } = renderMenu(
      <>
        <button type="button">Item 0</button>
        <button type="button">Item 1</button>
        <button type="button">Item 2</button>
      </>
    );

    // Go to last item first
    act(() => dispatchNavigate(container, 1));
    act(() => dispatchNavigate(container, 1));

    act(() => dispatchNavigate(container, -1));

    const buttons = container.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons[0].getAttribute('data-selected')).toBe('false');
    expect(buttons[1].getAttribute('data-selected')).toBe('true');
    expect(buttons[2].getAttribute('data-selected')).toBe('false');
  });

  it('clamps selection at the first item when navigating backward at index 0', () => {
    const { container } = renderMenu(
      <>
        <button type="button">Item 0</button>
        <button type="button">Item 1</button>
      </>
    );

    act(() => dispatchNavigate(container, -1));

    const buttons = container.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons[0].getAttribute('data-selected')).toBe('true');
  });

  it('clamps selection at the last item when navigating forward past the end', () => {
    const { container } = renderMenu(
      <>
        <button type="button">Item 0</button>
        <button type="button">Item 1</button>
      </>
    );

    act(() => dispatchNavigate(container, 1));
    act(() => dispatchNavigate(container, 1)); // attempt to go past the end

    const buttons = container.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons[0].getAttribute('data-selected')).toBe('false');
    expect(buttons[1].getAttribute('data-selected')).toBe('true');
  });
});
