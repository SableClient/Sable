import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ClientConfigProvider } from '$hooks/useClientConfig';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import { SettingTile } from '$components/setting-tile';
import { Settings } from './Settings';

const writeText = vi.fn<() => Promise<void>>();

const { mockMatrixClient, mockProfile } = vi.hoisted(() => ({
  mockMatrixClient: { getUserId: () => '@alice:server' },
  mockProfile: { displayName: 'Alice', avatarUrl: undefined },
}));

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
  useSetting: () => [true, vi.fn<() => void>()] as const,
}));

vi.mock('$state/settings', () => ({
  settingsAtom: {},
}));

vi.mock('./useSettingsFocus', () => ({
  useSettingsFocus: () => {},
}));

vi.mock('./general', () => ({
  General: ({ requestClose }: { requestClose: () => void }) => (
    <button type="button" onClick={requestClose}>
      General
    </button>
  ),
}));

vi.mock('./account', () => ({
  Account: ({ requestClose }: { requestClose: () => void }) => (
    <button type="button" onClick={requestClose}>
      Account
    </button>
  ),
}));

vi.mock('./Persona/ProfilesPage', () => ({
  PerMessageProfilePage: ({ requestClose }: { requestClose: () => void }) => (
    <button type="button" onClick={requestClose}>
      Persona
    </button>
  ),
}));

vi.mock('./cosmetics/Cosmetics', () => ({
  Cosmetics: ({ requestClose }: { requestClose: () => void }) => (
    <div>
      <SettingTile focusId="message-link-preview" title="Appearance" />
      <button type="button" onClick={requestClose}>
        Close
      </button>
    </div>
  ),
}));

vi.mock('./notifications', () => ({
  Notifications: ({ requestClose }: { requestClose: () => void }) => (
    <button type="button" onClick={requestClose}>
      Notifications
    </button>
  ),
}));

vi.mock('./devices', () => ({
  Devices: ({ requestClose }: { requestClose: () => void }) => (
    <button type="button" onClick={requestClose}>
      Devices
    </button>
  ),
}));

vi.mock('./emojis-stickers', () => ({
  EmojisStickers: ({ requestClose }: { requestClose: () => void }) => (
    <button type="button" onClick={requestClose}>
      Emojis
    </button>
  ),
}));

vi.mock('./developer-tools', () => ({
  DeveloperTools: ({ requestClose }: { requestClose: () => void }) => (
    <button type="button" onClick={requestClose}>
      Developer Tools
    </button>
  ),
}));

vi.mock('./experimental/Experimental', () => ({
  Experimental: ({ requestClose }: { requestClose: () => void }) => (
    <button type="button" onClick={requestClose}>
      Experimental
    </button>
  ),
}));

vi.mock('./about', () => ({
  About: ({ requestClose }: { requestClose: () => void }) => (
    <button type="button" onClick={requestClose}>
      About
    </button>
  ),
}));

vi.mock('./keyboard-shortcuts', () => ({
  KeyboardShortcuts: ({ requestClose }: { requestClose: () => void }) => (
    <button type="button" onClick={requestClose}>
      Keyboard Shortcuts
    </button>
  ),
}));

beforeEach(() => {
  writeText.mockReset();
  vi.stubGlobal('location', { origin: 'https://app.example' } as Location);
  vi.stubGlobal('navigator', { clipboard: { writeText } } as unknown as Navigator);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Settings', () => {
  it('uses the current app origin for copied settings links', async () => {
    writeText.mockResolvedValueOnce(undefined);

    render(
      <ClientConfigProvider value={{}}>
        <ScreenSizeProvider value={ScreenSize.Desktop}>
          <Settings activeSection="appearance" requestClose={vi.fn<() => void>()} />
        </ScreenSizeProvider>
      </ClientConfigProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /copy settings link/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'https://app.example/settings/appearance?focus=message-link-preview&moe.sable.client.action=settings'
      );
    });
  });

  it('preserves the configured hash-router basename in copied settings links', async () => {
    writeText.mockResolvedValueOnce(undefined);

    render(
      <ClientConfigProvider value={{ hashRouter: { enabled: true, basename: '/app' } }}>
        <ScreenSizeProvider value={ScreenSize.Desktop}>
          <Settings activeSection="appearance" requestClose={vi.fn<() => void>()} />
        </ScreenSizeProvider>
      </ClientConfigProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /copy settings link/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'https://app.example/#/app/settings/appearance?focus=message-link-preview&moe.sable.client.action=settings'
      );
    });
  });
});
