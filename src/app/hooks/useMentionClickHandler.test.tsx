import { render, fireEvent, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMentionClickHandler } from './useMentionClickHandler';

const { mockOpenSettings } = vi.hoisted(() => ({
  mockOpenSettings: vi.fn(),
}));

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({ getRoom: vi.fn() }),
}));

vi.mock('$hooks/useRoomNavigate', () => ({
  useRoomNavigate: () => ({ navigateRoom: vi.fn(), navigateSpace: vi.fn() }),
}));

vi.mock('$hooks/useSpace', () => ({
  useSpaceOptionally: () => undefined,
}));

vi.mock('$state/hooks/userRoomProfile', () => ({
  useOpenUserRoomProfile: () => vi.fn(),
}));

vi.mock('$features/settings/useOpenSettings', () => ({
  useOpenSettings: () => mockOpenSettings,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
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
});
