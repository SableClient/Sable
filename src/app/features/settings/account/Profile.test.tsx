import { render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import { SettingsLinkProvider } from '$features/settings/SettingsLinkContext';
import { Profile } from './Profile';

const mockMatrixClient = {
  getUserId: () => '@alice:example.org',
  setAvatarUrl: vi.fn<() => Promise<void>>(),
  setDisplayName: vi.fn<() => Promise<void>>(),
  setExtendedProfileProperty: vi.fn<() => Promise<void>>(),
  setPresence: vi.fn<() => Promise<void>>(),
};

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => mockMatrixClient,
}));

vi.mock('$hooks/useUserProfile', () => ({
  useUserProfile: () => ({
    displayName: 'Alice',
    extended: {
      'example.favorite': 'Blue',
    },
  }),
}));

vi.mock('$hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => false,
}));

vi.mock('$hooks/useCapabilities', () => ({
  useCapabilities: () => ({}),
}));

vi.mock('$hooks/useUserPresence', () => ({
  useUserPresence: () => undefined,
}));

vi.mock('$hooks/useFilePicker', () => ({
  useFilePicker: () => vi.fn<() => void>(),
}));

vi.mock('$hooks/useObjectURL', () => ({
  useObjectURL: () => undefined,
}));

vi.mock('$hooks/useAsyncCallback', () => ({
  AsyncStatus: {
    Idle: 'idle',
    Loading: 'loading',
    Success: 'success',
    Error: 'error',
  },
  useAsyncCallback: (callback: (...args: unknown[]) => unknown) => [
    { status: 'idle' },
    callback,
    vi.fn<() => void>(),
  ],
}));

vi.mock('$components/user-avatar', () => ({
  UserAvatar: () => <div>Avatar</div>,
}));

vi.mock('jotai', async () => {
  const actual = (await vi.importActual('jotai')) as object;
  return {
    ...actual,
    useSetAtom: () => vi.fn<() => void>(),
  };
});

vi.mock('./TimezoneEditor', () => ({
  TimezoneEditor: () => <div>Timezone</div>,
}));

vi.mock('./PronounEditor', () => ({
  PronounEditor: () => <div>Pronouns</div>,
}));

vi.mock('./BioEditor', () => ({
  BioEditor: () => <div>Bio</div>,
}));

vi.mock('./NameColorEditor', () => ({
  NameColorEditor: () => <div>Name Color</div>,
}));

vi.mock('./StatusEditor', () => ({
  StatusEditor: () => <div>Status</div>,
}));

vi.mock('./AnimalCosmetics', () => ({
  AnimalCosmetics: () => <div>Animal Cosmetics</div>,
}));

describe('Profile', () => {
  it('does not show copy settings links for custom profile fields', () => {
    const { container } = render(
      <ScreenSizeProvider value={ScreenSize.Desktop}>
        <SettingsLinkProvider value={{ section: 'account', baseUrl: 'https://app.example' }}>
          <Profile />
        </SettingsLinkProvider>
      </ScreenSizeProvider>
    );

    const displayNameTile = container.querySelector('[data-settings-focus="display-name"]');
    expect(displayNameTile).not.toBeNull();
    expect(
      within(displayNameTile as HTMLElement).getByRole('button', { name: /copy settings link/i })
    ).toBeInTheDocument();

    const customFieldTile = container.querySelector(
      '[data-settings-focus="profile-field-example-favorite"]'
    );
    expect(customFieldTile).not.toBeNull();
    expect(
      within(customFieldTile as HTMLElement).queryByRole('button', { name: /copy settings link/i })
    ).not.toBeInTheDocument();
  });
});
