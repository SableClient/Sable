import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { AuthMetadataProvider } from '$hooks/useAuthMetadata';
import { DeviceVerificationOptions } from './Verification';

vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn<() => boolean>(() => false),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn<(url: string) => Promise<void>>(),
}));

describe('DeviceVerificationOptions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the local reset-finalization flow available after opening account management', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <AuthMetadataProvider
        value={
          {
            issuer: 'https://auth.example',
            account_management_uri: 'https://auth.example/account',
          } as never
        }
      >
        <DeviceVerificationOptions />
      </AuthMetadataProvider>
    );

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getAllByText('Reset')[0]!);

    expect(openSpy).toHaveBeenCalledWith(
      'https://auth.example/account?action=org.matrix.cross_signing_reset',
      '_blank'
    );
    expect(
      await screen.findByText(
        'Complete the account-management reset in your browser, then return here to finish provisioning the new recovery key and verification state in Charm.'
      )
    ).toBeInTheDocument();
  });

  it('shows an error and does not enter reset finalization when opening account management fails', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(openUrl).mockRejectedValue(new Error('Launcher unavailable'));

    render(
      <AuthMetadataProvider
        value={
          {
            issuer: 'https://auth.example',
            account_management_uri: 'https://auth.example/account',
          } as never
        }
      >
        <DeviceVerificationOptions />
      </AuthMetadataProvider>
    );

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getAllByText('Reset')[0]!);

    expect(await screen.findByText('Launcher unavailable')).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Complete the account-management reset in your browser, then return here to finish provisioning the new recovery key and verification state in Charm.'
      )
    ).not.toBeInTheDocument();
  });
});
