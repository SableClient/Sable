import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ClientConfigProvider } from '$hooks/useClientConfig';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import { SettingsPermalinkProvider } from '$features/settings/SettingsPermalinkContext';
import { SettingTile } from './SettingTile';
import {
  settingTilePermalinkActionDesktopHidden,
  settingTilePermalinkActionMobileVisible,
} from './SettingTile.css';

const writeText = vi.fn();

function renderTile(screenSize: ScreenSize, focusId?: string) {
  return render(
    <ClientConfigProvider value={{}}>
      <ScreenSizeProvider value={screenSize}>
        <SettingsPermalinkProvider
          value={{ section: 'appearance', baseUrl: 'https://settings.example' }}
        >
          <SettingTile focusId={focusId} title="Appearance" />
        </SettingsPermalinkProvider>
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
  it('copies the real settings permalink when a focus id is present', async () => {
    writeText.mockResolvedValueOnce(undefined);

    renderTile(ScreenSize.Desktop, 'message-link-preview');

    fireEvent.click(screen.getByRole('button', { name: /copy settings permalink/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'https://settings.example/settings/appearance?focus=message-link-preview'
      );
    });
    expect(screen.getByRole('button', { name: /copied settings permalink/i })).toBeInTheDocument();
  });

  it('keeps the copy state unchanged when clipboard write fails', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));

    renderTile(ScreenSize.Desktop, 'message-link-preview');

    fireEvent.click(screen.getByRole('button', { name: /copy settings permalink/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'https://settings.example/settings/appearance?focus=message-link-preview'
      );
    });
    expect(screen.getByRole('button', { name: /copy settings permalink/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /copied settings permalink/i })
    ).not.toBeInTheDocument();
  });

  it('does not render a copy button without a focus id', () => {
    renderTile(ScreenSize.Desktop);

    expect(
      screen.queryByRole('button', { name: /copy settings permalink/i })
    ).not.toBeInTheDocument();
  });

  it('uses the desktop hidden-until-hover class for the permalink action', () => {
    renderTile(ScreenSize.Desktop, 'message-link-preview');

    expect(screen.getByText('Appearance').parentElement).toContainElement(
      screen.getByRole('button', { name: /copy settings permalink/i })
    );
    expect(screen.getByRole('button', { name: /copy settings permalink/i })).toHaveClass(
      settingTilePermalinkActionDesktopHidden
    );
  });

  it('uses the mobile always-visible class for the permalink action', () => {
    renderTile(ScreenSize.Mobile, 'message-link-preview');

    expect(screen.getByRole('button', { name: /copy settings permalink/i })).toHaveClass(
      settingTilePermalinkActionMobileVisible
    );
  });
});
