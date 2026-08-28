import { describe, it, expect } from 'vitest';
import type { ISSOFlow } from '$types/matrix-sdk';
import { isOauthAwarePreferred } from './useParsedLoginFlows';

describe('isOauthAwarePreferred', () => {
  it('is false for an undefined flow', () => {
    expect(isOauthAwarePreferred(undefined)).toBe(false);
  });

  it('is false for a plain SSO flow', () => {
    expect(isOauthAwarePreferred({ type: 'm.login.sso' } as ISSOFlow)).toBe(false);
  });

  it('reads the stable oauth_aware_preferred field', () => {
    const flow = { type: 'm.login.sso', oauth_aware_preferred: true } as ISSOFlow;
    expect(isOauthAwarePreferred(flow)).toBe(true);
  });

  it('reads the deprecated msc3824 field', () => {
    const flow = {
      type: 'm.login.sso',
      'org.matrix.msc3824.delegated_oidc_compatibility': true,
    } as ISSOFlow;
    expect(isOauthAwarePreferred(flow)).toBe(true);
  });
});
