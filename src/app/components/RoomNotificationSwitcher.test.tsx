import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as RoomsNotificationPreferencesModule from '$hooks/useRoomsNotificationPreferences';

import { RoomNotificationMode } from '$hooks/useRoomsNotificationPreferences';

import { RoomNotificationModeSwitcher } from './RoomNotificationSwitcher';

const { mockSetMode, modeStateStatus } = vi.hoisted(() => ({
  mockSetMode: vi.fn<(mode: RoomNotificationMode, current: RoomNotificationMode) => void>(),
  modeStateStatus: { current: 'idle' as 'idle' | 'loading' },
}));

vi.mock('$hooks/useRoomsNotificationPreferences', async () => {
  const actual = await vi.importActual<typeof RoomsNotificationPreferencesModule>(
    '$hooks/useRoomsNotificationPreferences'
  );

  return {
    ...actual,
    useSetRoomNotificationPreference: () => ({
      modeState: { status: modeStateStatus.current },
      setMode: mockSetMode,
    }),
  };
});

afterEach(() => {
  mockSetMode.mockClear();
});

describe('RoomNotificationModeSwitcher', () => {
  it('renders the shared selector trigger and real option content', () => {
    modeStateStatus.current = 'idle';

    render(
      <RoomNotificationModeSwitcher roomId="!room:example.org" value={RoomNotificationMode.Unset}>
        {(openMenu, opened, changing) => (
          <button type="button" onClick={openMenu}>
            {opened ? 'open' : 'closed'} {changing ? 'changing' : 'idle'}
          </button>
        )}
      </RoomNotificationModeSwitcher>
    );

    expect(screen.getByRole('button', { name: 'closed idle' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'closed idle' }));

    expect(screen.getByRole('button', { name: 'open idle' })).toBeInTheDocument();
    expect(screen.getByText('Follows your global notification rules')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mention & Keywords' }));

    expect(mockSetMode).toHaveBeenCalledOnce();
    expect(mockSetMode).toHaveBeenCalledWith(
      RoomNotificationMode.SpecialMessages,
      RoomNotificationMode.Unset
    );
  });

  it('disables interaction while the room mode is changing', () => {
    modeStateStatus.current = 'loading';

    render(
      <RoomNotificationModeSwitcher roomId="!room:example.org" value={RoomNotificationMode.Mute}>
        {(openMenu, opened, changing) => (
          <button type="button" disabled={changing} onClick={openMenu}>
            {opened ? 'open' : 'closed'} {changing ? 'changing' : 'idle'}
          </button>
        )}
      </RoomNotificationModeSwitcher>
    );

    const trigger = screen.getByRole('button', { name: 'closed changing' });

    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByRole('button', { name: 'open changing' })).not.toBeInTheDocument();

    expect(mockSetMode).not.toHaveBeenCalled();
  });
});
