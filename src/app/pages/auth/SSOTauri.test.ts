import { describe, expect, it } from 'vitest';

import { vi } from 'vitest';

vi.mock('@tauri-apps/plugin-os', () => ({
  type: () => 'macos',
}));

import {
  TAURI_SSO_CALLBACK_BASE,
  buildTauriSsoRedirectUrl,
  parseTauriSsoCallback,
} from './SSOTauri';

describe('Tauri SSO deep links', () => {
  it('uses the registered Charm deep-link callback scheme', () => {
    expect(TAURI_SSO_CALLBACK_BASE).toBe('charm://login');
    expect(buildTauriSsoRedirectUrl()).toBe('charm://login/lp/sso-callback');
    expect(buildTauriSsoRedirectUrl('matrix.org', { addAccount: true })).toBe(
      'charm://login/lp/sso-callback?server=matrix.org&addAccount=1'
    );
  });

  it('parses Charm login callbacks and rejects the old Sable scheme', () => {
    expect(parseTauriSsoCallback('charm://login?loginToken=token&server=matrix.org')).toEqual({
      loginToken: 'token',
      server: 'matrix.org',
      addAccount: false,
    });

    expect(
      parseTauriSsoCallback('charm://login?loginToken=token&server=matrix.org&addAccount=1')
    ).toEqual({
      loginToken: 'token',
      server: 'matrix.org',
      addAccount: true,
    });

    expect(parseTauriSsoCallback('sable://login?loginToken=token&server=matrix.org')).toBe(
      undefined
    );
  });
});
