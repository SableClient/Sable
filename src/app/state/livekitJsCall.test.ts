import { describe, expect, it } from 'vitest';
import { selectActiveCallSession } from './livekitJsCall';
import { acquireCallOwner, getActiveCallOwner, resetCallOwnerForTests } from './callOwner';

describe('selectActiveCallSession', () => {
  it('selects the JS owner when Element Call is absent', () => {
    const livekitSession = {
      roomId: '!room:example.org',
      lifecycle: 'active' as const,
      failure: null,
      mediaReady: true,
      initialMedia: { microphone: true, camera: false, sound: true },
      hangup: async () => undefined,
    };

    expect(selectActiveCallSession(undefined, livekitSession)).toBe(livekitSession);
  });

  it('preserves Element Call precedence over the JS owner', () => {
    const element = { roomId: '!element:example.org' };
    const livekit = {
      roomId: '!livekit:example.org',
      lifecycle: 'active' as const,
      failure: null,
      mediaReady: true,
      initialMedia: { microphone: true, camera: false, sound: true },
      hangup: async () => undefined,
    };

    expect(selectActiveCallSession(element, livekit)).toBe(element);
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
      mediaReady: false,
      initialMedia: { microphone: true, camera: false, sound: true },
      hangup: async () => undefined,
    };

    await selectActiveCallSession(element, livekit)?.hangup();

    expect(getActiveCallOwner()).toBeUndefined();
  });
});
