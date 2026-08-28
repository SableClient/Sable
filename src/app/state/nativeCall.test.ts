import { describe, expect, it } from 'vitest';
import {
  isNativeCallActive,
  selectActiveCallSessionIncludingNative,
  type NativeCallSession,
} from './nativeCall';
import type { LivekitJsCallSession } from './livekitJsCall';

const makeNativeSession = (lifecycle: NativeCallSession['lifecycle']): NativeCallSession => ({
  backend: 'livekit-mobile',
  roomId: '!room:example.org',
  callId: 'call-id',
  lifecycle,
  participants: [],
  microphoneEnabled: true,
  cameraEnabled: false,
  screenShareEnabled: false,
  setMicrophoneEnabled: async () => {},
  setCameraEnabled: async () => {},
  switchCamera: async () => {},
  listAudioRoutes: async () => [],
  selectAudioRoute: async () => {},
  hangup: async () => undefined,
});

const livekitSession: LivekitJsCallSession = {
  roomId: '!room:example.org',
  lifecycle: 'active',
  failure: null,
  mediaReady: true,
  initialMedia: { microphone: true, camera: false, sound: true },
  hangup: async () => undefined,
};

describe('isNativeCallActive', () => {
  it('treats missing or errored sessions as inactive', () => {
    expect(isNativeCallActive(undefined)).toBe(false);
    expect(isNativeCallActive(makeNativeSession('error'))).toBe(false);
    expect(isNativeCallActive(makeNativeSession('connected'))).toBe(true);
  });
});

describe('selectActiveCallSessionIncludingNative', () => {
  it('prefers Element Call and LiveKit JS over the native session', () => {
    const element = { roomId: '!room:example.org' };
    const native = makeNativeSession('connected');

    expect(selectActiveCallSessionIncludingNative(element, livekitSession, native)).toBe(element);
    expect(selectActiveCallSessionIncludingNative(undefined, livekitSession, native)).toBe(
      livekitSession
    );
  });

  it('returns the native session only when nothing else is active', () => {
    const native = makeNativeSession('connected');
    expect(selectActiveCallSessionIncludingNative(undefined, undefined, native)).toBe(native);
    expect(
      selectActiveCallSessionIncludingNative(undefined, undefined, makeNativeSession('error'))
    ).toBeUndefined();
    expect(selectActiveCallSessionIncludingNative(undefined, undefined, undefined)).toBeUndefined();
  });
});
