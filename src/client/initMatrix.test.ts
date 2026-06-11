import { describe, expect, it } from 'vitest';
import { resolveRefreshToken } from './initMatrix';

describe('resolveRefreshToken', () => {
  it('keeps the current refresh token when the homeserver omits refresh_token', () => {
    expect(resolveRefreshToken('refresh-2')).toBe('refresh-2');
    expect(resolveRefreshToken('refresh-2', 'refresh-3')).toBe('refresh-3');
  });
});
