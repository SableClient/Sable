import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeOAuthCallbackUrl } from './oauthCallback';

const goTo = (url: string) => window.history.replaceState(null, '', url);

describe('normalizeOAuthCallbackUrl', () => {
  beforeEach(() => {
    goTo('/');
  });

  it('moves a fragment callback into the query string, keeping the homeserver', () => {
    goTo('/login?server=matrix.org#code=c1&state=s1');
    normalizeOAuthCallbackUrl();
    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toBe('?server=matrix.org&code=c1&state=s1');
    expect(window.location.hash).toBe('');
  });

  it('keeps the homeserver when rebuilding the hash route', () => {
    goTo('/login?server=matrix.org#code=c1&state=s1');
    normalizeOAuthCallbackUrl({ enabled: true, basename: '/' });
    expect(window.location.hash).toBe('#/login?server=matrix.org&code=c1&state=s1');
  });

  it('leaves a url without a callback fragment alone', () => {
    goTo('/login?server=matrix.org');
    normalizeOAuthCallbackUrl();
    expect(window.location.search).toBe('?server=matrix.org');
  });
});
