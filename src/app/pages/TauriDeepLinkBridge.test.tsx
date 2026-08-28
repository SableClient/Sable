import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rememberTauriSsoNonce } from '$pages/auth/SSOTauri';
import { persistOauthContext } from '$pages/auth/login/oidcLoginUtil';
import { mapDeepLinkToLoginPath } from './TauriDeepLinkBridge';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

const rememberOidcState = (state: string) => {
  persistOauthContext(state, {
    issuer: 'https://issuer.example',
    clientId: 'client',
    redirectUri: 'moe.sable.app:/login',
    homeserverUrl: 'https://hs.example',
  });
};

describe('mapDeepLinkToLoginPath', () => {
  it('accepts an SSO callback whose nonce matches the stored one', () => {
    rememberTauriSsoNonce('nonce-1');
    const path = mapDeepLinkToLoginPath(
      'sable://login/lp/sso-callback?server=https%3A%2F%2Fhs.example&sso_nonce=nonce-1&loginToken=tok'
    );
    expect(path).toContain('loginToken=tok');
  });

  it('rejects an SSO callback with a mismatched nonce', () => {
    rememberTauriSsoNonce('nonce-1');
    expect(
      mapDeepLinkToLoginPath('sable://login/lp/sso-callback?sso_nonce=attacker&loginToken=tok')
    ).toBeUndefined();
  });

  it('rejects an SSO callback when no nonce was stored', () => {
    expect(
      mapDeepLinkToLoginPath('sable://login/lp/sso-callback?sso_nonce=x&loginToken=tok')
    ).toBeUndefined();
  });

  it('passes an OIDC callback through unchanged', () => {
    rememberOidcState('s1');
    const path = mapDeepLinkToLoginPath('moe.sable.app:/login?code=c1&state=s1');
    expect(path).toContain('code=c1');
    expect(path).toContain('state=s1');
  });

  it('passes normalized moe.sable.app://login OIDC callback through', () => {
    rememberOidcState('s1');
    const path = mapDeepLinkToLoginPath('moe.sable.app://login?code=c1&state=s1');
    expect(path).toContain('code=c1');
    expect(path).toContain('state=s1');
  });

  it('rejects a stale OIDC callback after its pending context was consumed', () => {
    expect(
      mapDeepLinkToLoginPath('moe.sable.app:/login?code=already-used&state=old-state')
    ).toBeUndefined();
  });

  it('returns undefined for an unrelated url', () => {
    expect(mapDeepLinkToLoginPath('https://example.com/whatever')).toBeUndefined();
  });
});
