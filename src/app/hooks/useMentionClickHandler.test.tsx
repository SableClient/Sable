import { render, fireEvent, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMentionClickHandler } from './useMentionClickHandler';

const { mockOpenSettings } = vi.hoisted(() => ({
  mockOpenSettings: vi.fn<(section: string, focus?: string) => void>(),
}));

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({ getRoom: vi.fn<() => undefined>() }),
}));

vi.mock('$hooks/useRoomNavigate', () => ({
  useRoomNavigate: () => ({
    navigateRoom: vi.fn<() => void>(),
    navigateSpace: vi.fn<() => void>(),
  }),
}));

vi.mock('$hooks/useSpace', () => ({
  useSpaceOptionally: () => undefined,
}));

vi.mock('$state/hooks/userRoomProfile', () => ({
  useOpenUserRoomProfile: () => vi.fn<() => void>(),
}));

vi.mock('$features/settings/useOpenSettings', () => ({
  useOpenSettings: () => mockOpenSettings,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn<() => void>(),
}));

function Wrapper({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

describe('useMentionClickHandler', () => {
  beforeEach(() => {
    mockOpenSettings.mockReset();
  });

  it('routes settings links through openSettings with section and focus', () => {
    const { result } = renderHook(() => useMentionClickHandler('!room:example.org'), {
      wrapper: Wrapper,
    });

    const { getByRole } = render(
      <button
        type="button"
        data-settings-link-section="appearance"
        data-settings-link-focus="message-link-preview"
        onClick={result.current}
      >
        Open settings link
      </button>
    );

    fireEvent.click(getByRole('button', { name: 'Open settings link' }));

    expect(mockOpenSettings).toHaveBeenCalledWith('appearance', 'message-link-preview');
  });

  it('drops malformed settings focus ids before calling openSettings', () => {
    const { result } = renderHook(() => useMentionClickHandler('!room:example.org'), {
      wrapper: Wrapper,
    });
    const malformedFocus = 'display-name">Settings';

    const { getByRole } = render(
      <button
        type="button"
        data-settings-link-section="account"
        data-settings-link-focus={malformedFocus}
        onClick={result.current}
      >
        Open malformed settings link
      </button>
    );

    fireEvent.click(getByRole('button', { name: 'Open malformed settings link' }));

    expect(mockOpenSettings).toHaveBeenCalledWith('account', undefined);
  });
});
