import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SettingTile } from '$components/setting-tile';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import { getHomePath, getSettingsPath } from '$pages/pathUtils';
import { SettingsRoute } from './SettingsRoute';
import { SettingsSectionPage } from './SettingsSectionPage';
import { focusedSettingTile } from './styles.css';
import { useSettingsFocus } from './useSettingsFocus';

const { mockMatrixClient, mockProfile, mockUseSetting, createSectionMock } = vi.hoisted(() => {
  const mockSettingsHook = vi.fn(() => [true, vi.fn()] as const);

  const createMockSection = (title: string) =>
    function MockSection({ requestClose }: { requestClose: () => void }) {
      return (
        <div>
          <h1>{title}</h1>
          <button type="button" onClick={requestClose}>
            Back
          </button>
        </div>
      );
    };

  return {
    mockMatrixClient: { getUserId: () => '@alice:server' },
    mockProfile: { displayName: 'Alice', avatarUrl: undefined },
    mockUseSetting: mockSettingsHook,
    createSectionMock: createMockSection,
  };
});

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => mockMatrixClient,
}));

vi.mock('$hooks/useUserProfile', () => ({
  useUserProfile: () => mockProfile,
}));

vi.mock('$hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => false,
}));

vi.mock('$state/hooks/settings', () => ({
  useSetting: mockUseSetting,
}));

vi.mock('./general', () => ({
  General: createSectionMock('General section'),
}));

vi.mock('./account', () => ({
  Account: createSectionMock('Account section'),
}));

vi.mock('./cosmetics/Cosmetics', () => ({
  Cosmetics: createSectionMock('Appearance section'),
}));

vi.mock('./notifications', () => ({
  Notifications: createSectionMock('Notifications section'),
}));

vi.mock('./devices', () => ({
  Devices: createSectionMock('Devices section'),
}));

vi.mock('./emojis-stickers', () => ({
  EmojisStickers: createSectionMock('Emojis & Stickers section'),
}));

vi.mock('./developer-tools/DevelopTools', () => ({
  DeveloperTools: createSectionMock('Developer Tools section'),
}));

vi.mock('./experimental/Experimental', () => ({
  Experimental: createSectionMock('Experimental section'),
}));

vi.mock('./about', () => ({
  About: createSectionMock('About section'),
}));

vi.mock('./keyboard-shortcuts', () => ({
  KeyboardShortcuts: createSectionMock('Keyboard Shortcuts section'),
}));

vi.mock('./Persona/ProfilesPage', () => ({
  PerMessageProfilePage: createSectionMock('Persona section'),
}));

function FocusFixture() {
  useSettingsFocus();

  return (
    <div>
      <SettingTile focusId="message-link-preview">focus target</SettingTile>
    </div>
  );
}

function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <div data-testid="location-probe">
      {location.pathname}
      {location.search}
      {navigationType}
    </div>
  );
}

function renderSettingsRoute(
  path: string,
  screenSize: ScreenSize,
  options?: { initialEntries?: string[]; initialIndex?: number }
) {
  const initialEntries = options?.initialEntries ?? [path];
  return render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={options?.initialIndex}>
      <ScreenSizeProvider value={screenSize}>
        <LocationProbe />
        <Routes>
          <Route path="/settings/:section?/" element={<SettingsRoute />} />
        </Routes>
      </ScreenSizeProvider>
    </MemoryRouter>
  );
}

describe('SettingsSectionPage', () => {
  it('shows a back affordance on mobile section pages', () => {
    render(
      <ScreenSizeProvider value={ScreenSize.Mobile}>
        <SettingsSectionPage title="Devices" requestClose={vi.fn()} />
      </ScreenSizeProvider>
    );

    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('supports custom title semantics and close label', () => {
    render(
      <ScreenSizeProvider value={ScreenSize.Desktop}>
        <SettingsSectionPage
          title="Keyboard Shortcuts"
          titleAs="h1"
          actionLabel="Close keyboard shortcuts"
          requestClose={vi.fn()}
        />
      </ScreenSizeProvider>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Keyboard Shortcuts');
    expect(screen.getByRole('button', { name: 'Close keyboard shortcuts' })).toBeInTheDocument();
  });
});

describe('SettingsRoute', () => {
  it('renders the menu index on mobile /settings', () => {
    renderSettingsRoute('/settings', ScreenSize.Mobile);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'General section' })).not.toBeInTheDocument();
  });

  it('shows the general section by default on desktop /settings without mutating the URL', () => {
    renderSettingsRoute('/settings', ScreenSize.Desktop);

    expect(screen.getByRole('heading', { name: 'General section' })).toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/settings');
  });

  it('renders the requested section at /settings/devices', () => {
    renderSettingsRoute('/settings/devices', ScreenSize.Mobile);

    expect(screen.getByRole('heading', { name: 'Devices section' })).toBeInTheDocument();
  });

  it('redirects invalid sections back to /settings', async () => {
    renderSettingsRoute('/settings/not-a-real-section', ScreenSize.Mobile);

    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent(getSettingsPath())
    );
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('falls back to /settings when a direct section entry is closed', async () => {
    const user = userEvent.setup();

    renderSettingsRoute('/settings/devices', ScreenSize.Mobile);

    await user.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent(getSettingsPath())
    );
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('falls back to /home when the root settings page is closed from a direct entry', async () => {
    const user = userEvent.setup();

    renderSettingsRoute('/settings', ScreenSize.Mobile);

    await user.click(screen.getByRole('button', { name: 'Close settings' }));

    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent(getHomePath())
    );
  });

  it('navigates when a menu item is clicked', async () => {
    const user = userEvent.setup();

    renderSettingsRoute('/settings', ScreenSize.Mobile);

    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent(
        getSettingsPath('notifications')
      )
    );
    expect(screen.getByRole('heading', { name: 'Notifications section' })).toBeInTheDocument();
  });

  it('does not push history when the active section is reselected', async () => {
    const user = userEvent.setup();

    renderSettingsRoute('/settings/notifications', ScreenSize.Desktop);

    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/settings/notifications');
    expect(screen.getByTestId('location-probe')).not.toHaveTextContent('PUSH');
  });

  it('uses history back semantics when a section back button is clicked', async () => {
    const user = userEvent.setup();

    renderSettingsRoute('/settings/devices', ScreenSize.Mobile, {
      initialEntries: ['/settings/', '/settings/devices/'],
      initialIndex: 1,
    });

    await user.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('POP'));
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});

describe('useSettingsFocus', () => {
  it('highlights a focus target from the query string', async () => {
    vi.useFakeTimers();

    try {
      render(
        <MemoryRouter initialEntries={['/settings/appearance?focus=message-link-preview']}>
          <ScreenSizeProvider value={ScreenSize.Mobile}>
            <LocationProbe />
            <FocusFixture />
          </ScreenSizeProvider>
        </MemoryRouter>
      );

      const target = document.querySelector('[data-settings-focus="message-link-preview"]');
      expect(target).toHaveClass(focusedSettingTile);
      expect(screen.getByTestId('location-probe')).toHaveTextContent('?focus=message-link-preview');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2999);
      });
      expect(screen.getByTestId('location-probe')).toHaveTextContent('?focus=message-link-preview');
      expect(target).toHaveClass(focusedSettingTile);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/settings/appearance');
      expect(target).not.toHaveClass(focusedSettingTile);
    } finally {
      vi.useRealTimers();
    }
  });
});
