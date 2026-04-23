import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ClientConfigProvider } from '$hooks/useClientConfig';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import { SettingsLinkProvider } from '$features/settings/SettingsLinkContext';
import { SettingTile } from './SettingTile';
import {
  settingTileSettingLinkActionDesktopHidden,
  settingTileSettingLinkActionMobileVisible,
  settingTileSettingLinkActionTransparentBackground,
} from './SettingTile.css';

const writeText = vi.fn<() => Promise<void>>();

function renderTile(
  screenSize: ScreenSize,
  focusId?: string,
  options?: Partial<React.ComponentProps<typeof SettingTile>>
) {
  return render(
    <ClientConfigProvider value={{}}>
      <ScreenSizeProvider value={screenSize}>
        <SettingsLinkProvider
          value={{ section: 'appearance', baseUrl: 'https://settings.example' }}
        >
          <SettingTile focusId={focusId} title="Appearance" {...options} />
        </SettingsLinkProvider>
      </ScreenSizeProvider>
    </ClientConfigProvider>
  );
}

beforeEach(() => {
  writeText.mockReset();
  vi.stubGlobal('navigator', { clipboard: { writeText } } as unknown as Navigator);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettingTile', () => {
  it('copies the real settings link when a focus id is present', async () => {
    writeText.mockResolvedValueOnce(undefined);

    renderTile(ScreenSize.Desktop, 'message-link-preview');

    fireEvent.click(screen.getByRole('button', { name: /copy settings link/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'https://settings.example/settings/appearance?focus=message-link-preview&moe.sable.client.action=settings'
      );
    });
    expect(screen.getByRole('button', { name: /copied settings link/i })).toBeInTheDocument();
  });

  it('keeps the copy state unchanged when clipboard write fails', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));

    renderTile(ScreenSize.Desktop, 'message-link-preview');

    fireEvent.click(screen.getByRole('button', { name: /copy settings link/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'https://settings.example/settings/appearance?focus=message-link-preview&moe.sable.client.action=settings'
      );
    });
    expect(screen.getByRole('button', { name: /copy settings link/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copied settings link/i })).not.toBeInTheDocument();
  });

  it('does not render a copy button without a focus id', () => {
    renderTile(ScreenSize.Desktop);

    expect(screen.queryByRole('button', { name: /copy settings link/i })).not.toBeInTheDocument();
  });

  it('does not render a copy button when setting link actions are disabled', () => {
    renderTile(ScreenSize.Desktop, 'message-link-preview', {
      showSettingLinkAction: false,
    });

    expect(screen.queryByRole('button', { name: /copy settings link/i })).not.toBeInTheDocument();
  });

  it('uses the desktop hidden-until-hover class for the setting link action', () => {
    renderTile(ScreenSize.Desktop, 'message-link-preview');

    expect(screen.getByText('Appearance').parentElement).toContainElement(
      screen.getByRole('button', { name: /copy settings link/i })
    );
    expect(screen.getByRole('button', { name: /copy settings link/i })).toHaveClass(
      settingTileSettingLinkActionTransparentBackground,
      {
        exact: false,
      }
    );
    expect(screen.getByRole('button', { name: /copy settings link/i })).toHaveClass(
      settingTileSettingLinkActionDesktopHidden
    );
  });

  it('uses the mobile always-visible class for the setting link action', () => {
    renderTile(ScreenSize.Mobile, 'message-link-preview');

    expect(screen.getByRole('button', { name: /copy settings link/i })).toHaveClass(
      settingTileSettingLinkActionMobileVisible
    );
  });
});
