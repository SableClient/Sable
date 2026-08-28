import { atom as jotaiAtom } from 'jotai';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import { RoomSettingsPage } from '$state/roomSettings';
import type { Room } from '$types/matrix-sdk';
import { RoomSettings } from './RoomSettings';

// ── Mock room factory ──

function createMockRoom(isSpace: boolean): Room {
  return {
    roomId: isSpace ? '!space:server' : '!room:server',
    isSpaceRoom: () => isSpace,
    getType: () => undefined,
  } as unknown as Room;
}

// ── Mutable mock globals — updated per render, referenced by hoisted vi.mock ──

let mockRoom = createMockRoom(false);

const mockMatrixClient = { getUserId: () => '@user:server' };

// ── Module mocks (vi.mock is hoisted, must reference module-scope vars) ──

vi.mock('$hooks/useRoom', () => ({
  useRoom: () => mockRoom,
}));

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => mockMatrixClient,
}));

vi.mock('$hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => false,
}));

vi.mock('$hooks/useRoomMeta', () => ({
  useRoomAvatar: () => undefined,
  useRoomName: () => 'Test Room',
  useRoomJoinRule: () => undefined,
}));

vi.mock('$state/mDirectList', () => ({
  mDirectAtom: jotaiAtom(new Set<string>()),
}));

vi.mock('$state/hooks/settings', () => ({
  useSetting: () => [false, vi.fn<(value: boolean) => void>()] as const,
}));

vi.mock('$components/room-avatar', () => ({
  RoomAvatar: () => null,
  RoomIcon: () => null,
}));

// Section component mocks — each renders a div with its title text
function mkSection(title: string) {
  return function MockSection({
    requestBack,
    requestClose,
  }: {
    requestBack?: () => void;
    requestClose: () => void;
  }): ReactNode {
    return (
      <div>
        <h1>{title}</h1>
        {requestBack && (
          <button type="button" onClick={requestBack}>
            Back
          </button>
        )}
        <button type="button" onClick={requestClose}>
          Close
        </button>
      </div>
    );
  };
}

vi.mock('./general', () => ({ General: mkSection('General section') }));
vi.mock('./permissions', () => ({ Permissions: mkSection('Permissions section') }));
vi.mock('$features/common-settings/members', () => ({
  Members: mkSection('Members section'),
}));
vi.mock('$features/common-settings/cosmetics/Cosmetics', () => ({
  Cosmetics: mkSection('Cosmetics section'),
}));
vi.mock('./abbreviations/RoomAbbreviations', () => ({
  RoomAbbreviations: mkSection('Abbreviations section'),
}));
vi.mock('$features/common-settings/emojis-stickers', () => ({
  EmojisStickers: mkSection('Emojis & Stickers section'),
}));
vi.mock('$features/common-settings/developer-tools', () => ({
  DeveloperTools: mkSection('Developer Tools section'),
}));
vi.mock('$features/common-settings/appearance/Appearance', () => ({
  Appearance: mkSection('Appearance section'),
}));

// Captures the SwipeableOverlayWrapper onClose (i.e. RoomSettings' swipe-back handler)
// so tests can trigger it without simulating touch gestures.
let capturedSwipeBack: (() => void) | undefined;
let capturedSwipeDirection: 'left' | 'right' | 'both' | undefined;
vi.mock('$components/SwipeableOverlayWrapper', () => ({
  SwipeableOverlayWrapper: ({
    children,
    direction,
    onClose,
  }: {
    children: ReactNode;
    direction: 'left' | 'right' | 'both';
    onClose: () => void;
  }) => {
    capturedSwipeBack = onClose;
    capturedSwipeDirection = direction;
    return <div>{children}</div>;
  },
}));

// ── Render helper ──

function renderRoomSettings({
  isSpace = false,
  screenSize = ScreenSize.Desktop,
  initialPage,
  openedViaSwipe,
}: {
  isSpace?: boolean;
  screenSize?: ScreenSize;
  initialPage?: RoomSettingsPage;
  openedViaSwipe?: boolean;
} = {}) {
  mockRoom = createMockRoom(isSpace);

  const requestClose = vi.fn<() => void>();

  render(
    <ScreenSizeProvider value={screenSize}>
      <RoomSettings
        initialPage={initialPage}
        openedViaSwipe={openedViaSwipe}
        requestClose={requestClose}
      />
    </ScreenSizeProvider>
  );

  return { requestClose };
}

// ── Tests ──

describe('RoomSettings menu', () => {
  it('renders expected sections for a space', () => {
    renderRoomSettings({ isSpace: true });

    const expectedLabels = [
      'General',
      'Members',
      'Permissions',
      'Cosmetics',
      'Abbreviations',
      'Emojis & Stickers',
      'Developer Tools',
      'Appearance',
    ];

    for (const label of expectedLabels) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('renders expected sections for a non-space room', () => {
    renderRoomSettings({ isSpace: false });

    const expectedLabels = [
      'General',
      'Members',
      'Permissions',
      'Cosmetics',
      'Abbreviations',
      'Emojis & Stickers',
      'Developer Tools',
    ];

    for (const label of expectedLabels) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }

    // Appearance is gated by isSpace
    expect(screen.queryByRole('button', { name: 'Appearance' })).not.toBeInTheDocument();
  });

  it('switches active section on menu click', async () => {
    const user = userEvent.setup();

    renderRoomSettings({ isSpace: true });

    // Desktop starts on General page
    expect(screen.getByRole('heading', { name: 'General section' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Permissions' }));

    expect(screen.getByRole('heading', { name: 'Permissions section' })).toBeInTheDocument();
  });

  it('calls setActivePage(undefined) on mobile back (not requestClose)', async () => {
    const user = userEvent.setup();

    const { requestClose } = renderRoomSettings({
      isSpace: true,
      screenSize: ScreenSize.Mobile,
    });

    // On mobile, no initial page — menu is shown
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('Test Room')).toBeInTheDocument();

    // Click a section to activate it
    await user.click(screen.getByRole('button', { name: 'Members' }));

    // Section content appears with a Back button
    expect(screen.getByRole('heading', { name: 'Members section' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();

    // Click Back
    await user.click(screen.getByRole('button', { name: 'Back' }));

    // Menu returns — not requestClose (no close was called)
    expect(requestClose).not.toHaveBeenCalled();
    expect(screen.getByText('Test Room')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'General' })).toBeInTheDocument();
  });

  it('swipe closes the overlay directly when opened via swipe', () => {
    const { requestClose } = renderRoomSettings({
      isSpace: false,
      screenSize: ScreenSize.Mobile,
      initialPage: RoomSettingsPage.MembersPage,
      openedViaSwipe: true,
    });

    expect(screen.getByRole('heading', { name: 'Members section' })).toBeInTheDocument();
    expect(capturedSwipeDirection).toBe('both');

    expect(capturedSwipeBack).toBeDefined();
    act(() => capturedSwipeBack?.());

    expect(requestClose).toHaveBeenCalled();
    // Still on the sections page (never navigated back to the section list)
    expect(screen.getByRole('heading', { name: 'Members section' })).toBeInTheDocument();
  });

  it('rightward swipe goes back to the section list when not opened via swipe', () => {
    const { requestClose } = renderRoomSettings({
      isSpace: false,
      screenSize: ScreenSize.Mobile,
      initialPage: RoomSettingsPage.MembersPage,
    });

    expect(screen.getByRole('heading', { name: 'Members section' })).toBeInTheDocument();
    expect(capturedSwipeDirection).toBe('right');

    expect(capturedSwipeBack).toBeDefined();
    act(() => capturedSwipeBack?.());

    expect(requestClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Members section' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Members' })).toBeInTheDocument();
  });

  it('visible flag gates section content', () => {
    // Render for a non-space room, but try to force the Appearance section
    // by starting on AppearancePage. The SettingsShell's `visible !== false`
    // gate should prevent the section from rendering.
    renderRoomSettings({
      isSpace: false,
      screenSize: ScreenSize.Desktop,
      initialPage: RoomSettingsPage.AppearancePage,
    });

    // Menu still shows (no Appearance menu item)
    expect(screen.queryByRole('button', { name: 'Appearance' })).not.toBeInTheDocument();

    // Section content is empty — nothing renders because visible gate blocks it
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
