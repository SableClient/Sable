// oxlint-disable typescript/no-explicit-any
// oxlint-disable jsx-a11y/click-events-have-key-events
// oxlint-disable jsx-a11y/no-static-element-interactions
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import type { Room } from '$types/matrix-sdk';
import { RoomMenu } from './RoomMenu';

const mocks = vi.hoisted(() => ({
  isDirect: true,
  // Keep referentially stable, otherwise useAsyncSearch re-renders in a loop.
  mx: {
    getSafeUserId: () => '@me:example.com',
    invite: vi.fn<() => void>(),
    leave: vi.fn<() => void>(),
  },
  directUsers: [],
}));

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => mocks.mx,
}));

vi.mock('$hooks/useSpace', () => ({
  useSpaceOptionally: () => undefined,
}));

vi.mock('$state/hooks/roomSettings', () => ({
  useOpenRoomSettings: vi.fn<() => () => void>(() => () => {}),
}));

vi.mock('$state/hooks/settings', () => ({
  useSetSetting: vi.fn<() => () => void>(() => () => {}),
}));

vi.mock('$hooks/useDirectUsers', () => ({
  useDirectUsers: () => mocks.directUsers,
}));

vi.mock('$hooks/useRoomsNotificationPreferences', () => ({
  useRoomsNotificationPreferencesContext: () => ({
    mute: new Set<string>(),
    specialMessages: new Set<string>(),
    allMessages: new Set<string>(),
  }),
  getRoomNotificationMode: () => 'Unset',
  roomNotificationModeIcon: () => null,
  RoomNotificationMode: {
    Unset: 'Unset',
    Mute: 'Mute',
    SpecialMessages: 'SpecialMessages',
    AllMessages: 'AllMessages',
  },
  useSetRoomNotificationPreference: () => ({
    modeState: { status: 'Idle' },
    setMode: vi.fn<() => void>(),
  }),
}));

vi.mock('$utils/androidBack', () => ({
  useDismissOnBack: vi.fn<() => void>(),
}));

// Mirrors the real hook's swap guard.
vi.mock('$hooks/useRoomMenuActions', async () => {
  const { useCallback, useRef, useState } = await import('react');
  return {
    useRoomMenuActions: () => {
      const [invitePrompt, setInvitePrompt] = useState(false);
      const [directInvitePrompt, setDirectInvitePrompt] = useState(false);
      const invitePromptRef = useRef(invitePrompt);
      invitePromptRef.current = invitePrompt;
      const cancelConsumedRef = useRef(false);

      const handleInvite = useCallback(() => {
        cancelConsumedRef.current = false;
        if (mocks.isDirect) setDirectInvitePrompt(true);
        else setInvitePrompt(true);
      }, []);

      const handleInviteDirect = useCallback(() => {
        setDirectInvitePrompt(false);
        setInvitePrompt(true);
      }, []);

      const handleDirectInviteCancel = useCallback((closeMenu: () => void) => {
        setDirectInvitePrompt(false);
        if (!invitePromptRef.current && !cancelConsumedRef.current) {
          cancelConsumedRef.current = true;
          closeMenu();
        }
      }, []);

      const handleConvertAndInvite = useCallback(() => {
        setDirectInvitePrompt(false);
        setInvitePrompt(true);
      }, []);

      return {
        handleMarkAsRead: vi.fn<() => void>(),
        handleInvite,
        handleCopyLink: vi.fn<() => void>(),
        handleOpenSettings: vi.fn<() => void>(),
        handleLeaveRoom: vi.fn<() => Promise<boolean>>(async () => false),
        canInvite: true,
        unread: true,
        invitePrompt,
        setInvitePrompt,
        directInvitePrompt,
        setDirectInvitePrompt,
        handleInviteDirect,
        handleDirectInviteCancel,
        handleConvertAndInvite,
        convertState: { status: 'Idle' },
        navigateRoom: vi.fn<() => void>(),
      };
    },
  };
});

const room = { roomId: '!dm:example.com' } as unknown as Room;

// jsdom has no layout; fake a rect so focus-trap can find tabbable nodes.
beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    { width: 10, height: 10 },
  ] as unknown as DOMRectList);
});

afterAll(() => {
  vi.restoreAllMocks();
});

function renderRoomMenu(requestClose: () => void) {
  return render(
    <ScreenSizeProvider value={ScreenSize.Desktop}>
      <RoomMenu room={room} requestClose={requestClose} />
    </ScreenSizeProvider>
  );
}

beforeEach(() => {
  mocks.isDirect = true;
});

afterEach(() => {
  cleanup();
});

describe('RoomMenu invite flow', () => {
  it('swaps the direct-invite prompt for the invite dialog without closing the menu', () => {
    const requestClose = vi.fn<() => void>();
    renderRoomMenu(requestClose);

    fireEvent.click(screen.getByText('Invite'));
    // Prose is split across <b>; match the button label instead.
    expect(screen.getByText('Convert to Group Chat and Invite')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Invite to Direct Message anyway'));

    // Unmount re-fires onCancel; a swap is not a cancel.
    expect(requestClose).not.toHaveBeenCalled();
    expect(screen.getByText('User ID')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('@username:server')).toBeInTheDocument();
  });

  it('closes the menu on a genuine cancel of the direct-invite prompt', () => {
    const requestClose = vi.fn<() => void>();
    renderRoomMenu(requestClose);

    fireEvent.click(screen.getByText('Invite'));
    expect(screen.getByText('Convert to Group Chat and Invite')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));

    expect(requestClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('User ID')).not.toBeInTheDocument();
  });

  it('opens the invite dialog directly for a non-direct room', () => {
    mocks.isDirect = false;
    const requestClose = vi.fn<() => void>();
    renderRoomMenu(requestClose);

    fireEvent.click(screen.getByText('Invite'));

    expect(requestClose).not.toHaveBeenCalled();
    expect(screen.getByText('User ID')).toBeInTheDocument();
    expect(screen.queryByText('Convert to Group Chat and Invite')).not.toBeInTheDocument();
  });
});
