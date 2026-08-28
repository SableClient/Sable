import { describe, expect, it } from 'vitest';
import { legacyAuthRedirectPath } from './legacyAuthRedirect';
import { LOGIN_PATH, REGISTER_PATH } from './paths';

describe('legacyAuthRedirectPath', () => {
  it('moves the server segment into the query string', () => {
    expect(
      legacyAuthRedirectPath(LOGIN_PATH, 'https://app.sable.moe/login/matrix.org', 'matrix.org')
    ).toBe('/login?server=matrix.org');
    expect(
      legacyAuthRedirectPath(REGISTER_PATH, 'https://app.sable.moe/register/sable.moe', 'sable.moe')
    ).toBe('/register?server=sable.moe');
  });

  it('keeps the callback params an sso or oidc redirect brings back', () => {
    expect(
      legacyAuthRedirectPath(
        LOGIN_PATH,
        'https://app.sable.moe/login/matrix.org?loginToken=tok',
        'matrix.org'
      )
    ).toBe('/login?loginToken=tok&server=matrix.org');
    expect(
      legacyAuthRedirectPath(
        LOGIN_PATH,
        'https://app.sable.moe/login/matrix.org?code=c1&state=s1',
        'matrix.org'
      )
    ).toBe('/login?code=c1&state=s1&server=matrix.org');
  });

  it('keeps a server url that survived as one segment', () => {
    expect(
      legacyAuthRedirectPath(
        LOGIN_PATH,
        'https://app.sable.moe/login/http%3Alocalhost%3A18448',
        'http:localhost:18448'
      )
    ).toBe('/login?server=http%3Alocalhost%3A18448');
  });

  it('drops a segment split by an unescaped slash', () => {
    expect(
      legacyAuthRedirectPath(
        LOGIN_PATH,
        'https://app.sable.moe/login/http%3A/localhost%3A18448',
        'http:/localhost:18448'
      )
    ).toBe('/login');
  });

  it('redirects a bare legacy path without inventing a server', () => {
    expect(legacyAuthRedirectPath(LOGIN_PATH, 'https://app.sable.moe/login/', '')).toBe('/login');
    expect(
      legacyAuthRedirectPath(LOGIN_PATH, 'https://app.sable.moe/login/?addAccount=1', undefined)
    ).toBe('/login?addAccount=1');
  });
});
