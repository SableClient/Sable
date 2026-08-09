import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteAfterLoginRedirectPath,
  getAfterLoginRedirectPath,
  setAfterLoginRedirectPath,
} from './afterLoginRedirectPath';

describe('afterLoginRedirectPath', () => {
  beforeEach(() => {
    deleteAfterLoginRedirectPath();
  });

  it('stores an in-app path', () => {
    setAfterLoginRedirectPath('/home/room/%21abc');
    expect(getAfterLoginRedirectPath()).toBe('/home/room/%21abc');
  });

  it('ignores auth paths', () => {
    setAfterLoginRedirectPath('/login/matrix.org');
    setAfterLoginRedirectPath('/register/matrix.org');
    setAfterLoginRedirectPath('/reset-password/matrix.org');
    expect(getAfterLoginRedirectPath()).toBeUndefined();
  });

  it('ignores the root path and off-site destinations', () => {
    setAfterLoginRedirectPath('/');
    setAfterLoginRedirectPath('https://example.com/');
    setAfterLoginRedirectPath('//example.com/');
    expect(getAfterLoginRedirectPath()).toBeUndefined();
  });

  it('discards an already stored auth path', () => {
    localStorage.setItem('after_login_redirect_url', '/login/http%3A/localhost%3A18448');
    expect(getAfterLoginRedirectPath()).toBeUndefined();
  });
});
