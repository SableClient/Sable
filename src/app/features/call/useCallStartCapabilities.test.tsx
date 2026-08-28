import type { ReactNode } from 'react';
import { act, render } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient, Room } from '$types/matrix-sdk';
import type { CallEmbed } from '$plugins/call';
import { MatrixClientProvider } from '$hooks/useMatrixClient';
import { AutoDiscoveryInfoProvider } from '$hooks/useAutoDiscoveryInfo';
import { nativeCallAtom, type NativeCallSession } from '$state/nativeCall';
import type { CallStartCapabilities } from '@sableclient/matrixrtc';
import { useCallStartCapabilities } from './useCallStartCapabilities';

const { webRtcSupportedMock, useCallEmbedMock } = vi.hoisted(() => ({
  webRtcSupportedMock: vi.fn<() => boolean>(() => true),
  useCallEmbedMock: vi.fn<() => CallEmbed | undefined>(() => undefined),
}));

vi.mock('$utils/rtc', () => ({
  webRTCSupported: () => webRtcSupportedMock(),
}));

vi.mock('$hooks/useCallEmbed', () => ({
  useCallEmbed: () => useCallEmbedMock(),
}));

const room = {
  roomId: '!room:example.org',
  currentState: {
    maySendStateEvent: () => true,
  },
} as unknown as Room;

const mx = {
  getSafeUserId: () => '@me:example.org',
  on: vi.fn<(...args: unknown[]) => void>(),
  removeListener: vi.fn<(...args: unknown[]) => void>(),
  // This homeserver advertises no MSC4143 transports, so these cases exercise
  // the `.well-known` fallback that the fixtures below configure.
  _unstable_getRTCTransports: () => Promise.reject(new Error('M_NOT_FOUND')),
} as unknown as MatrixClient;

const makeNativeSession = (
  roomId: string,
  lifecycle: NativeCallSession['lifecycle']
): NativeCallSession => ({
  backend: 'livekit-mobile',
  roomId,
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

type Harness = {
  store: ReturnType<typeof createStore>;
  wrapper: ({ children }: { children?: ReactNode }) => ReactNode;
  latest: () => CallStartCapabilities;
};

const createHarness = (): Harness => {
  const store = createStore();
  let current: CallStartCapabilities | undefined;
  const Probe = (): null => {
    current = useCallStartCapabilities(room);
    return null;
  };
  const wrapper = ({ children }: { children?: ReactNode }) => (
    <JotaiProvider store={store}>
      <MatrixClientProvider value={mx}>
        <AutoDiscoveryInfoProvider
          value={
            {
              'org.matrix.msc4143.rtc_foci': [
                { livekit_service_url: 'https://livekit.example.org' },
              ],
            } as never
          }
        >
          {children ?? <Probe />}
        </AutoDiscoveryInfoProvider>
      </MatrixClientProvider>
    </JotaiProvider>
  );
  const latest = (): CallStartCapabilities => {
    expect(current).toBeDefined();
    return current!;
  };
  return { store, wrapper, latest };
};

describe('useCallStartCapabilities', () => {
  beforeEach(() => {
    webRtcSupportedMock.mockReset().mockReturnValue(true);
    useCallEmbedMock.mockReset().mockReturnValue(undefined);
  });

  it('blocks starting in another room while a native call is active there', () => {
    const harness = createHarness();
    harness.store.set(nativeCallAtom, makeNativeSession('!other:example.org', 'connected'));

    render(<harness.wrapper>{undefined}</harness.wrapper>);

    const capabilities = harness.latest();
    expect(capabilities.inAnotherCall).toBe(true);
    expect(capabilities.blockers).toContain('already_in_another_call');
    expect(capabilities.canStart).toBe(false);
  });

  it('stops treating a native session as active once it reaches the error state', () => {
    const harness = createHarness();
    render(<harness.wrapper>{undefined}</harness.wrapper>);

    act(() => {
      harness.store.set(nativeCallAtom, makeNativeSession('!other:example.org', 'starting'));
    });
    expect(harness.latest().inAnotherCall).toBe(true);

    act(() => {
      harness.store.set(nativeCallAtom, makeNativeSession('!other:example.org', 'error'));
    });
    const capabilities = harness.latest();
    expect(capabilities.inAnotherCall).toBe(false);
    expect(capabilities.blockers).not.toContain('already_in_another_call');
    expect(capabilities.canStart).toBe(true);
  });

  it('still counts an active Element call embed as an active call', () => {
    const harness = createHarness();
    useCallEmbedMock.mockReturnValue({
      roomId: '!other:example.org',
    } as CallEmbed);

    render(<harness.wrapper>{undefined}</harness.wrapper>);

    const capabilities = harness.latest();
    expect(capabilities.inAnotherCall).toBe(true);
    expect(capabilities.blockers).toContain('already_in_another_call');
  });
});
