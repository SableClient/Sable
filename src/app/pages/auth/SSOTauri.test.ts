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
  });

  it('parses Charm login callbacks and rejects the old Sable scheme', () => {
    expect(parseTauriSsoCallback('charm://login?loginToken=token&server=matrix.org')).toEqual({
      loginToken: 'token',
      server: 'matrix.org',
    });

    expect(parseTauriSsoCallback('sable://login?loginToken=token&server=matrix.org')).toBe(
      undefined
    );
  });
});
