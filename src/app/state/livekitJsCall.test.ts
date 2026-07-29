import { describe, expect, it } from 'vitest';
import { selectActiveCallSession } from './livekitJsCall';
import { acquireCallOwner, getActiveCallOwner, resetCallOwnerForTests } from './callOwner';

describe('selectActiveCallSession', () => {
  it('selects the JS owner when Element Call and native sessions are absent', () => {
    const livekitSession = {
      roomId: '!room:example.org',
      lifecycle: 'active' as const,
      failure: null,
      hangup: async () => undefined,
    };

    expect(selectActiveCallSession(undefined, undefined, livekitSession)).toBe(livekitSession);
  });

  it('preserves Element Call and native precedence', () => {
    const element = { roomId: '!element:example.org' };
    const native = {
      roomId: '!native:example.org',
      connectionId: 'native',
      lifecycle: 'connected' as const,
      hangup: async () => undefined,
    };
    const livekit = {
      roomId: '!livekit:example.org',
      lifecycle: 'active' as const,
      failure: null,
      hangup: async () => undefined,
    };

    expect(selectActiveCallSession(element, native, livekit)).toBe(element);
    expect(selectActiveCallSession(undefined, native, livekit)).toBe(native);
  });

  it('routes past a failed native session to the active JS owner and releases its lease', async () => {
    resetCallOwnerForTests();
    const lease = acquireCallOwner('livekit-js', '!room:example.org');
    const livekit = {
      roomId: '!room:example.org',
      lifecycle: 'active' as const,
      failure: null,
      hangup: async () => lease?.release(),
    };
    const native = {
      roomId: '!room:example.org',
      connectionId: 'native',
      lifecycle: 'error' as const,
      hangup: async () => undefined,
    };

    await selectActiveCallSession(undefined, native, livekit)?.hangup();

    expect(getActiveCallOwner()).toBeUndefined();
  });

  it('routes past a failed JS session to Element Call and releases its lease', async () => {
    resetCallOwnerForTests();
    const lease = acquireCallOwner('element', '!room:example.org');
    const element = {
      roomId: '!room:example.org',
      hangup: async () => lease?.release(),
    };
    const livekit = {
      roomId: '!room:example.org',
      lifecycle: 'failed' as const,
      failure: 'setup-failed' as const,
      hangup: async () => undefined,
    };

    await selectActiveCallSession(element, undefined, livekit)?.hangup();

    expect(getActiveCallOwner()).toBeUndefined();
  });
});
