import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientConfigProvider } from '$hooks/useClientConfig';
import { SettingsLinkBaseUrlSetting } from './SettingsLinkBaseUrlSetting';

let settingsLinkBaseUrlOverride: string | undefined;
const setSettingsLinkBaseUrlOverride = vi.fn();

vi.mock('$state/hooks/settings', () => ({
  useSetting: () => [settingsLinkBaseUrlOverride, setSettingsLinkBaseUrlOverride] as const,
}));

vi.mock('$state/settings', () => ({
  settingsAtom: {},
}));

function renderSetting(settingsLinkBaseUrl = 'https://app.sable.moe') {
  return render(
    <ClientConfigProvider value={{ settingsLinkBaseUrl }}>
      <SettingsLinkBaseUrlSetting />
    </ClientConfigProvider>
  );
}

describe('SettingsLinkBaseUrlSetting', () => {
  beforeEach(() => {
    settingsLinkBaseUrlOverride = undefined;
    setSettingsLinkBaseUrlOverride.mockReset();
  });

  it('shows the configured default in the input and no separate reset button', () => {
    renderSetting('https://config.example');

    expect(screen.getByRole('textbox', { name: 'Settings link base URL' })).toHaveValue(
      'https://config.example'
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
  });

  it('uses an inline reset control to restore the configured default URL', () => {
    renderSetting('https://config.example');

    fireEvent.change(screen.getByRole('textbox', { name: 'Settings link base URL' }), {
      target: { value: 'https://override.example' },
    });

    expect(
      screen.getByRole('button', { name: 'Reset settings link base URL' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset settings link base URL' }));

    expect(screen.getByRole('textbox', { name: 'Settings link base URL' })).toHaveValue(
      'https://config.example'
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('clears the override when saving the configured default URL', () => {
    settingsLinkBaseUrlOverride = 'https://override.example';
    renderSetting('https://config.example');

    fireEvent.change(screen.getByRole('textbox', { name: 'Settings link base URL' }), {
      target: { value: 'https://config.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(setSettingsLinkBaseUrlOverride).toHaveBeenCalledWith(undefined);
  });
});
