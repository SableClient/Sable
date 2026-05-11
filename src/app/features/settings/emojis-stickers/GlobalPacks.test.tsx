import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import { SettingsLinkProvider } from '$features/settings/SettingsLinkContext';
import type { ImagePack } from '$plugins/custom-emoji';
import { GlobalPacks } from './GlobalPacks';

const globalPack = {
  id: 'pack-1',
  meta: {
    name: 'Animals',
    attribution: 'Cute pack',
  },
  address: {
    roomId: '!room:example',
    stateKey: 'pack',
  },
  deleted: false,
  getAvatarUrl: () => undefined,
} as never;

vi.mock('$hooks/useImagePacks', () => ({
  useGlobalImagePacks: () => [globalPack],
  useRoomsImagePacks: () => [],
}));

vi.mock('$hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => false,
}));

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    getRoom: () => undefined,
    getAccountData: () => undefined,
    setAccountData: vi.fn<() => Promise<void>>(),
  }),
}));

vi.mock('jotai', async () => {
  const actual = (await vi.importActual('jotai')) as object;
  return {
    ...actual,
    useAtomValue: () => [],
  };
});

describe('GlobalPacks', () => {
  it('does not show copy settings links for individual pack rows', () => {
    const { container } = render(
      <ScreenSizeProvider value={ScreenSize.Desktop}>
        <SettingsLinkProvider value={{ section: 'emojis', baseUrl: 'https://app.example' }}>
          <GlobalPacks onViewPack={vi.fn<(imagePack: ImagePack) => void>()} />
        </SettingsLinkProvider>
      </ScreenSizeProvider>
    );

    const selectorTile = container.querySelector('[data-settings-focus="select-pack"]');
    expect(selectorTile).not.toBeNull();
    expect(
      within(selectorTile as HTMLElement).getByRole('button', { name: /copy settings link/i })
    ).toBeInTheDocument();

    const packTile = container.querySelector('[data-settings-focus="selected-pack-pack-1"]');
    expect(packTile).not.toBeNull();
    expect(screen.getByText('Animals')).toBeInTheDocument();
    expect(
      within(packTile as HTMLElement).queryByRole('button', { name: /copy settings link/i })
    ).not.toBeInTheDocument();
  });
});
