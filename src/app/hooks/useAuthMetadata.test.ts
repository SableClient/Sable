import { describe, expect, it } from 'vitest';
import type { ValidatedAuthMetadata } from '$types/matrix-sdk';
import type { Session } from '$state/sessions';
import { getSessionAuthMetadata } from './useAuthMetadata';

const metadata = {
  issuer: 'https://auth.example.org/',
  authorization_endpoint: 'https://auth.example.org/authorize',
  token_endpoint: 'https://auth.example.org/token',
  registration_endpoint: 'https://auth.example.org/register',
  response_types_supported: ['code'],
  response_modes_supported: ['query'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  account_management_uri: 'https://auth.example.org/account',
} as ValidatedAuthMetadata;

const session: Session = {
  baseUrl: 'https://matrix.example.org',
  userId: '@alice:example.org',
  deviceId: 'DEVICE',
  accessToken: 'access-token',
};

describe('getSessionAuthMetadata', () => {
  it('does not expose delegated account management to non-OIDC sessions', () => {
    expect(getSessionAuthMetadata(metadata, session)).toBeUndefined();
  });

  it('exposes delegated account management to OIDC sessions', () => {
    const oidcSession: Session = {
      ...session,
      oidc: {
        issuer: metadata.issuer,
        clientId: 'client-id',
      },
    };

    expect(getSessionAuthMetadata(metadata, oidcSession)).toBe(metadata);
  });

  it('does not invent metadata when an OIDC session has no discovered metadata', () => {
    const oidcSession: Session = {
      ...session,
      oidc: {
        issuer: metadata.issuer,
        clientId: 'client-id',
      },
    };

    expect(getSessionAuthMetadata(undefined, oidcSession)).toBeUndefined();
  });
});
