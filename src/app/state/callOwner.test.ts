import { beforeEach, describe, expect, it } from 'vitest';
import { acquireCallOwner, getActiveCallOwner, resetCallOwnerForTests } from './callOwner';

beforeEach(() => resetCallOwnerForTests());

describe('call owner guard', () => {
  it('allows one owner and rejects competing owners until release', () => {
    const native = acquireCallOwner('native', '!room:example.org');

    expect(native).toBeDefined();
    expect(acquireCallOwner('livekit-js', '!room:example.org')).toBeUndefined();
    expect(getActiveCallOwner()).toMatchObject({ kind: 'native' });

    native?.release();
    expect(acquireCallOwner('element', '!room:example.org')).toBeDefined();
  });

  it('makes release idempotent and cannot release a replacement lease', () => {
    const first = acquireCallOwner('element', '!room:example.org');
    first?.release();
    const second = acquireCallOwner('livekit-js', '!room:example.org');

    first?.release();
    expect(getActiveCallOwner()).toMatchObject({ kind: 'livekit-js' });
    second?.release();
    expect(getActiveCallOwner()).toBeUndefined();
  });
});
