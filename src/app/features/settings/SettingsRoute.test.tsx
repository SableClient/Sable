import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Text } from 'folds';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { ClientConfigProvider } from '$hooks/useClientConfig';
import { ClientLayout } from '$pages/client';
import { ClientRouteOutlet } from '$pages/client/ClientRouteOutlet';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import * as pageCss from '$components/page/style.css';
import { messageJumpHighlight } from '$components/message/layout/layout.css';
import { getHomePath, getSettingsPath } from '$pages/pathUtils';
import { SETTINGS_PATH } from '$pages/paths';
import { SettingsRoute } from './SettingsRoute';
import { SettingsShallowRouteRenderer } from './SettingsShallowRouteRenderer';
import { SettingsSectionPage } from './SettingsSectionPage';
import { focusedSettingTile } from './styles.css';
import * as settingsCss from './styles.css';
import { useOpenSettings } from './useOpenSettings';
import { useSettingsFocus } from './useSettingsFocus';

type RouterInitialEntry =
  | string
  | {
      pathname: string;
      search?: string;
      hash?: string;
      state?: unknown;
      key?: string;
    };

const { mockMatrixClient, mockProfile, mockUseSetting, createSectionMock } = vi.hoisted(() => {
  const mockSettingsHook = vi.fn<() => readonly [boolean, (value: boolean) => void]>(
    () => [true, vi.fn<(value: boolean) => void>()] as const
  );
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- vi.hoisted helpers cannot reference outer-scope factories
  const createMockSection = (title: string) =>
    function MockSection({
      requestBack,
      requestClose,
    }: {
      requestBack?: () => void;
      requestClose: () => void;
    }) {
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

vi.mock('$components/Modal500', () => ({
  Modal500: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('./general', () => ({
  General: ({
    requestBack,
    requestClose,
  }: {
    requestBack?: () => void;
    requestClose: () => void;
  }) => (
    <div>
      <h1>General section</h1>
      <SequenceCard variant="SurfaceVariant" direction="Column">
        <SettingTile focusId="message-layout">Message Layout</SettingTile>
      </SequenceCard>
      {requestBack && (
        <button type="button" onClick={requestBack}>
          Back
        </button>
      )}
      <button type="button" onClick={requestClose}>
        Close
      </button>
    </div>
  ),
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
      <SequenceCard variant="SurfaceVariant" direction="Column">
        <SettingTile focusId="message-link-preview">focus target</SettingTile>
      </SequenceCard>
    </div>
  );
}

function FocusFixtureToggle() {
  const [visible, setVisible] = useState(true);

  return (
    <div>
      <button type="button" onClick={() => setVisible((current) => !current)}>
        Toggle focus fixture
      </button>
      {visible && <FocusFixture />}
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

function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div>
      <h1>Home route</h1>
      <button
        type="button"
        onClick={() =>
          navigate(getSettingsPath('notifications'), {
            state: { backgroundLocation: location },
          })
        }
      >
        Open settings
      </button>
    </div>
  );
}

function OpenSettingsHomePage() {
  const openSettings = useOpenSettings();

  return (
    <div>
      <h1>Home route</h1>
      <button type="button" onClick={() => openSettings('devices')}>
        Open devices settings
      </button>
      <button type="button" onClick={() => openSettings('general', 'message-layout')}>
        Open focused general settings
      </button>
    </div>
  );
}

function renderClientShell(
  screenSize: ScreenSize,
  options?: { initialEntries?: RouterInitialEntry[]; initialIndex?: number }
) {
  const initialEntries = options?.initialEntries ?? [getHomePath()];
  return render(
    <ClientConfigProvider value={{}}>
      <MemoryRouter initialEntries={initialEntries} initialIndex={options?.initialIndex}>
        <ScreenSizeProvider value={screenSize}>
          <LocationProbe />
          <Routes>
            <Route element={<ClientRouteOutlet />}>
              <Route path={getHomePath()} element={<HomePage />} />
              <Route path={SETTINGS_PATH} element={<SettingsRoute />} />
            </Route>
          </Routes>
          <SettingsShallowRouteRenderer />
        </ScreenSizeProvider>
      </MemoryRouter>
    </ClientConfigProvider>
  );
}

function SidebarSettingsShortcut() {
  const openSettings = useOpenSettings();

  return (
    <button type="button" onClick={() => openSettings('devices')}>
      Sidebar devices shortcut
    </button>
  );
}

function renderClientShellWithOpenSettings(
  screenSize: ScreenSize,
  options?: { initialEntries?: RouterInitialEntry[]; initialIndex?: number }
) {
  const initialEntries = options?.initialEntries ?? [getHomePath()];
  return render(
    <ClientConfigProvider value={{}}>
      <MemoryRouter initialEntries={initialEntries} initialIndex={options?.initialIndex}>
        <ScreenSizeProvider value={screenSize}>
          <LocationProbe />
          <SidebarSettingsShortcut />
          <Routes>
            <Route element={<ClientRouteOutlet />}>
              <Route path={getHomePath()} element={<OpenSettingsHomePage />} />
              <Route path={SETTINGS_PATH} element={<SettingsRoute />} />
            </Route>
          </Routes>
          <SettingsShallowRouteRenderer />
        </ScreenSizeProvider>
      </MemoryRouter>
    </ClientConfigProvider>
  );
}

function renderClientLayoutShell(
  screenSize: ScreenSize,
  options?: { initialEntries?: RouterInitialEntry[]; initialIndex?: number }
) {
  const initialEntries = options?.initialEntries ?? [getHomePath()];
  return render(
    <ClientConfigProvider value={{}}>
      <MemoryRouter initialEntries={initialEntries} initialIndex={options?.initialIndex}>
        <ScreenSizeProvider value={screenSize}>
          <LocationProbe />
          <Routes>
            <Route
              element={
                <ClientLayout nav={<div>App sidebar</div>}>
                  <ClientRouteOutlet />
                </ClientLayout>
              }
            >
              <Route path={getHomePath()} element={<HomePage />} />
              <Route path={SETTINGS_PATH} element={<SettingsRoute />} />
            </Route>
          </Routes>
          <SettingsShallowRouteRenderer />
        </ScreenSizeProvider>
      </MemoryRouter>
    </ClientConfigProvider>
  );
}

function renderSettingsRoute(
  path: string,
  screenSize: ScreenSize,
  options?: { initialEntries?: RouterInitialEntry[]; initialIndex?: number }
) {
  const initialEntries = options?.initialEntries ?? [path];
  return render(
    <ClientConfigProvider value={{}}>
      <MemoryRouter initialEntries={initialEntries} initialIndex={options?.initialIndex}>
        <ScreenSizeProvider value={screenSize}>
          <LocationProbe />
          <Routes>
            <Route path={SETTINGS_PATH} element={<SettingsRoute />} />
          </Routes>
        </ScreenSizeProvider>
      </MemoryRouter>
    </ClientConfigProvider>
  );
}

describe('SettingsSectionPage', () => {
  it('reuses the message jump highlight class without adding a separate radius override', () => {
    expect(focusedSettingTile).toBe(messageJumpHighlight);
  });

  it('shows back on the left and close on the right for mobile section pages', () => {
    render(
      <ScreenSizeProvider value={ScreenSize.Mobile}>
        <SettingsSectionPage
          title="Devices"
          requestBack={vi.fn<() => void>()}
          requestClose={vi.fn<() => void>()}
        />
      </ScreenSizeProvider>
    );

    expect(
      screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))
    ).toEqual(['Back', 'Close']);
  });

  it('supports custom title semantics and close label without a desktop back button', () => {
    render(
      <ScreenSizeProvider value={ScreenSize.Desktop}>
        <SettingsSectionPage
          title="Keyboard Shortcuts"
          titleAs="h1"
          actionLabel="Close keyboard shortcuts"
          requestBack={vi.fn<() => void>()}
          requestClose={vi.fn<() => void>()}
        />
      </ScreenSizeProvider>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Keyboard Shortcuts');
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close keyboard shortcuts' })).toBeInTheDocument();
  });

  it('uses the default outlined page header treatment', () => {
    render(
      <ScreenSizeProvider value={ScreenSize.Desktop}>
        <SettingsSectionPage
          title="Devices"
          requestBack={vi.fn<() => void>()}
          requestClose={vi.fn<() => void>()}
        />
      </ScreenSizeProvider>
    );

    expect(screen.getByText('Devices').closest('header')).toHaveClass(pageCss.PageHeader({}));
  });

  it('matches the main settings header title size', () => {
    const rootRender = renderSettingsRoute('/settings', ScreenSize.Mobile);
    const mainHeaderClassName = screen.getByText('Settings').className;

    rootRender.unmount();

    render(
      <ScreenSizeProvider value={ScreenSize.Mobile}>
        <SettingsSectionPage
          title="Devices"
          requestBack={vi.fn<() => void>()}
          requestClose={vi.fn<() => void>()}
        />
      </ScreenSizeProvider>
    );

    expect(screen.getByText('Devices').className).toBe(mainHeaderClassName);
  });

  it('uses settings header spacing that matches the main settings shell', () => {
    render(
      <ScreenSizeProvider value={ScreenSize.Mobile}>
        <SettingsSectionPage
          title="Devices"
          requestBack={vi.fn<() => void>()}
          requestClose={vi.fn<() => void>()}
        />
      </ScreenSizeProvider>
    );

    expect(screen.getByText('Devices').closest('header')).toHaveClass(settingsCss.settingsHeader);
  });
});

describe('SettingsRoute', () => {
  it('renders the menu index on mobile /settings', () => {
    renderSettingsRoute('/settings', ScreenSize.Mobile);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'General section' })).not.toBeInTheDocument();
  });

  it('uses the default outlined nav header treatment for the settings menu', () => {
    renderSettingsRoute('/settings', ScreenSize.Mobile);

    expect(screen.getByText('Settings').closest('header')).toHaveClass(pageCss.PageNavHeader({}));
  });

  it('uses larger nav labels on mobile settings', () => {
    const referenceRender = render(
      <Text size="T400" truncate>
        Reference
      </Text>
    );
    const mobileClassName = screen.getByText('Reference').className;

    referenceRender.unmount();

    renderSettingsRoute('/settings', ScreenSize.Mobile);

    expect(screen.getByText('Notifications').className).toBe(mobileClassName);
  });

  it('redirects desktop /settings to /settings/general', async () => {
    renderSettingsRoute('/settings', ScreenSize.Desktop);

    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent(getSettingsPath('general'))
    );
    expect(screen.getByRole('heading', { name: 'General section' })).toBeInTheDocument();
  });

  it('canonicalizes legacy trailing-slash settings section routes', async () => {
    renderSettingsRoute('/settings/general/', ScreenSize.Mobile);

    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/settings/general')
    );
    expect(screen.getByTestId('location-probe')).not.toHaveTextContent('/settings/general/');
    expect(screen.getByRole('heading', { name: 'General section' })).toBeInTheDocument();
  });

  it('falls back to /home when the redirected desktop general page is closed from a direct root entry', async () => {
    const user = userEvent.setup();

    renderSettingsRoute('/settings', ScreenSize.Desktop);

    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent(getSettingsPath('general'))
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent(getHomePath())
    );
  });

  it('closes to the stored background route instead of stepping through prior settings entries', async () => {
    const user = userEvent.setup();
    const backgroundLocation = {
      pathname: getHomePath(),
      search: '',
      hash: '',
      state: null,
      key: 'home',
    };

    renderSettingsRoute(getSettingsPath('devices'), ScreenSize.Desktop, {
      initialEntries: [
        getHomePath(),
        {
          pathname: getSettingsPath('notifications'),
          state: { backgroundLocation },
          key: 'settings-notifications',
        },
        {
          pathname: getSettingsPath('devices'),
          state: { backgroundLocation },
          key: 'settings-devices',
        },
      ],
      initialIndex: 2,
    });

    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent(getHomePath())
    );
    expect(screen.getByTestId('location-probe')).not.toHaveTextContent(
      getSettingsPath('notifications')
    );
  });

  it('renders the requested section at /settings/devices', () => {
    renderSettingsRoute('/settings/devices', ScreenSize.Mobile);

    expect(screen.getByRole('heading', { name: 'Devices section' })).toBeInTheDocument();
  });

  it('focuses and highlights a real general setting tile from the URL', async () => {
    vi.useFakeTimers();

    try {
      renderSettingsRoute('/settings/general?focus=message-layout', ScreenSize.Mobile);

      const target = document.querySelector('[data-settings-focus="message-layout"]');
      const highlightTarget = target?.parentElement;

      expect(target).not.toHaveClass(focusedSettingTile);
      expect(highlightTarget).toHaveClass(focusedSettingTile);
      expect(screen.getByTestId('location-probe')).toHaveTextContent('?focus=message-layout');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(highlightTarget).not.toHaveClass(focusedSettingTile);
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/settings/general');
    } finally {
      vi.useRealTimers();
    }
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

  it('falls back to /home when a direct section entry is closed', async () => {
    const user = userEvent.setup();

    renderSettingsRoute('/settings/devices', ScreenSize.Mobile);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent(getHomePath())
    );
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
      initialEntries: [getSettingsPath(), getSettingsPath('devices')],
      initialIndex: 1,
    });

    await user.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('POP'));
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});

describe('Settings shallow route shell', () => {
  it('keeps desktop settings shallow after the focus highlight completes', async () => {
    vi.useFakeTimers();

    try {
      renderClientShellWithOpenSettings(ScreenSize.Desktop);

      fireEvent.click(screen.getByRole('button', { name: 'Open focused general settings' }));

      expect(screen.getByRole('heading', { name: 'Home route' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'General section' })).toBeInTheDocument();
      expect(screen.getByTestId('location-probe')).toHaveTextContent('?focus=message-layout');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(screen.getByTestId('location-probe')).toHaveTextContent('/settings/general');
      expect(screen.getByTestId('location-probe')).toHaveTextContent('?focus=message-layout');
      expect(screen.getByRole('heading', { name: 'Home route' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'General section' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens device settings through route navigation and keeps the desktop background mounted', async () => {
    const user = userEvent.setup();

    renderClientShellWithOpenSettings(ScreenSize.Desktop);

    await user.click(screen.getByRole('button', { name: 'Open devices settings' }));

    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent(getSettingsPath('devices'))
    );
    expect(screen.getByRole('heading', { name: 'Home route' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Devices section' })).toBeInTheDocument();
  });

  it('does not create a nested shallow settings view when opened from full-page settings', async () => {
    const user = userEvent.setup();

    renderClientShellWithOpenSettings(ScreenSize.Desktop, {
      initialEntries: [getSettingsPath('notifications')],
    });

    await user.click(screen.getByRole('button', { name: 'Sidebar devices shortcut' }));

    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent(getSettingsPath('devices'))
    );
    expect(screen.getByRole('heading', { name: 'Devices section' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Notifications section' })
    ).not.toBeInTheDocument();
  });

  it('keeps the desktop background route mounted when settings opens shallow', async () => {
    const user = userEvent.setup();

    renderClientShell(ScreenSize.Desktop);

    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    expect(screen.getByRole('heading', { name: 'Home route' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Notifications section' })).toBeInTheDocument();
  });

  it('renders mobile settings as a full page without retaining the background outlet', async () => {
    const user = userEvent.setup();

    renderClientShell(ScreenSize.Mobile);

    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    expect(screen.queryByRole('heading', { name: 'Home route' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Notifications section' })).toBeInTheDocument();
  });

  it('keeps the desktop background route mounted while switching shallow settings sections', async () => {
    const user = userEvent.setup();

    renderClientShell(ScreenSize.Desktop);

    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(screen.getByRole('button', { name: 'Devices' }));

    expect(screen.getByRole('heading', { name: 'Home route' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Devices section' })).toBeInTheDocument();
  });

  it('does not show a desktop section back button in shallow settings', async () => {
    const user = userEvent.setup();

    renderClientShell(ScreenSize.Desktop);

    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(screen.getByRole('button', { name: 'Devices' }));

    expect(screen.getByRole('heading', { name: 'Home route' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Devices section' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('closes a desktop shallow settings flow in one step after switching sections', async () => {
    const user = userEvent.setup();

    renderClientShell(ScreenSize.Desktop);

    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(screen.getByRole('button', { name: 'Devices' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByRole('heading', { name: 'Home route' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Devices section' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Notifications section' })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent(getHomePath());
  });

  it('renders desktop direct entry settings as a full page without retaining the background outlet', () => {
    renderClientShell(ScreenSize.Desktop, {
      initialEntries: [getSettingsPath('devices')],
    });

    expect(screen.queryByRole('heading', { name: 'Home route' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Devices section' })).toBeInTheDocument();
  });

  it('hides the client sidebar when desktop settings renders as a full page', () => {
    renderClientLayoutShell(ScreenSize.Desktop, {
      initialEntries: [getSettingsPath('devices')],
    });

    expect(screen.queryByText('App sidebar')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Devices section' })).toBeInTheDocument();
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
      const highlightTarget = target?.parentElement;
      expect(target).not.toHaveClass(focusedSettingTile);
      expect(highlightTarget).toHaveClass(focusedSettingTile);
      expect(highlightTarget).toHaveClass(messageJumpHighlight);
      expect(screen.getByTestId('location-probe')).toHaveTextContent('?focus=message-link-preview');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2999);
      });
      expect(screen.getByTestId('location-probe')).toHaveTextContent('?focus=message-link-preview');
      expect(highlightTarget).toHaveClass(focusedSettingTile);
      expect(highlightTarget).toHaveClass(messageJumpHighlight);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.getByTestId('location-probe')).toHaveTextContent(
        '/settings/appearance?focus=message-link-preview'
      );
      expect(highlightTarget).not.toHaveClass(focusedSettingTile);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not re-highlight when the same focus entry remounts', async () => {
    vi.useFakeTimers();

    try {
      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/settings/appearance',
              search: '?focus=message-link-preview',
              key: 'focus-entry',
            },
          ]}
        >
          <ScreenSizeProvider value={ScreenSize.Mobile}>
            <LocationProbe />
            <FocusFixtureToggle />
          </ScreenSizeProvider>
        </MemoryRouter>
      );

      let target = document.querySelector('[data-settings-focus="message-link-preview"]');
      let highlightTarget = target?.parentElement;

      expect(highlightTarget).toHaveClass(focusedSettingTile);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(highlightTarget).not.toHaveClass(focusedSettingTile);
      expect(screen.getByTestId('location-probe')).toHaveTextContent(
        '/settings/appearance?focus=message-link-preview'
      );

      fireEvent.click(screen.getByRole('button', { name: 'Toggle focus fixture' }));
      fireEvent.click(screen.getByRole('button', { name: 'Toggle focus fixture' }));

      target = document.querySelector('[data-settings-focus="message-link-preview"]');
      highlightTarget = target?.parentElement;

      expect(highlightTarget).not.toHaveClass(focusedSettingTile);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores malformed focus ids without throwing', () => {
    expect(() =>
      render(
        <MemoryRouter initialEntries={['/settings/appearance?focus=display-name%22%3ESettings']}>
          <ScreenSizeProvider value={ScreenSize.Mobile}>
            <LocationProbe />
            <FocusFixture />
          </ScreenSizeProvider>
        </MemoryRouter>
      )
    ).not.toThrow();

    const target = document.querySelector('[data-settings-focus="message-link-preview"]');
    const highlightTarget = target?.parentElement;

    expect(highlightTarget).not.toHaveClass(focusedSettingTile);
    expect(screen.getByTestId('location-probe')).toHaveTextContent(
      '/settings/appearance?focus=display-name%22%3ESettings'
    );
  });
});
