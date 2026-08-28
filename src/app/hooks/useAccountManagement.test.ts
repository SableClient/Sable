import { describe, expect, it } from 'vitest';
import type { ValidatedAuthMetadata } from '$types/matrix-sdk';
import { getAccountManagementUrl } from './useAccountManagement';

const metadata = {
  issuer: 'https://auth.example',
  authorization_endpoint: 'https://auth.example/authorize',
  token_endpoint: 'https://auth.example/token',
  registration_endpoint: 'https://auth.example/register',
  revocation_endpoint: 'https://auth.example/revoke',
  response_types_supported: ['code'],
  response_modes_supported: ['query', 'fragment'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  account_management_uri: '/_continuwuity/',
  account_management_actions_supported: ['org.matrix.devices_list'],
} as ValidatedAuthMetadata;

describe('getAccountManagementUrl', () => {
  it('resolves account paths against the discovered homeserver URL', () => {
    expect(
      getAccountManagementUrl(
        metadata,
        'org.matrix.devices_list',
        undefined,
        'https://actual-homeserver.example/matrix'
      )
    ).toBe('https://actual-homeserver.example/_continuwuity/?action=org.matrix.devices_list');
  });
});
