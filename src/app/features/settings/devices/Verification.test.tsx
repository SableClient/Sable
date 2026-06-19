import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthMetadataProvider } from '$hooks/useAuthMetadata';
import { DeviceVerificationOptions } from './Verification';

vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn<(url: string) => Promise<void>>(),
}));

describe('DeviceVerificationOptions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the local reset-finalization flow available after opening account management', () => {
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
      screen.getByText(
        'Complete the account-management reset in your browser, then return here to finish provisioning the new recovery key and verification state in Charm.'
      )
    ).toBeInTheDocument();
  });
});
