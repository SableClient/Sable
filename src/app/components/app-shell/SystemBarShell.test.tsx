import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemBarShell } from './SystemBarShell';

const { mockIsTauri, mockOsType } = vi.hoisted(() => ({
  mockIsTauri: vi.fn<() => boolean>(),
  mockOsType: vi.fn<() => string>(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn<() => Promise<void>>(),
  isTauri: mockIsTauri,
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  type: mockOsType,
}));

describe('SystemBarShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not observe document mutations outside mobile Tauri', () => {
    mockIsTauri.mockReturnValue(false);
    const mutationObserver = vi.fn<() => void>();
    vi.stubGlobal('MutationObserver', mutationObserver);

    const { container } = render(
      <SystemBarShell onPortalContainerChange={vi.fn<(node: HTMLDivElement | null) => void>()}>
        <div>Content</div>
      </SystemBarShell>
    );

    expect(mockOsType).not.toHaveBeenCalled();
    expect(mutationObserver).not.toHaveBeenCalled();
    expect(container.querySelector('[data-system-bar-position="top"]')).toHaveStyle({
      height: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))',
    });
    expect(container.querySelector('[data-system-bar-position="bottom"]')).not.toBeInTheDocument();
  });
});
