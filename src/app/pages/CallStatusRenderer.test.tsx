import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { livekitJsCallAtom, type LivekitJsCallSession } from '../state/livekitJsCall';
import { nativeCallAtom, type NativeCallSession } from '../state/nativeCall';
import { CallStatusRenderer } from './CallStatusRenderer';

const mocks = vi.hoisted(() => ({
  callEmbed: undefined as { roomId: string } | undefined,
  selectedRoom: undefined as string | undefined,
  screenSize: 'Desktop',
}));

vi.mock('../hooks/useCallEmbed', () => ({ useCallEmbed: () => mocks.callEmbed }));
vi.mock('../hooks/router/useSelectedRoom', () => ({
  useSelectedRoom: () => mocks.selectedRoom,
}));
vi.mock('../hooks/useScreenSize', () => ({
  ScreenSize: { Mobile: 'Mobile', Desktop: 'Desktop' },
  useScreenSizeContext: () => mocks.screenSize,
}));
vi.mock('../features/call-status', () => ({
  CallStatus: () => <div data-testid="element-call-status" />,
}));
vi.mock('../features/call-status/LivekitCallStatus', () => ({
  LivekitCallStatus: () => <div data-testid="livekit-call-status" />,
}));
vi.mock('../features/call-status/NativeCallStatus', () => ({
  NativeCallStatus: () => <div data-testid="native-call-status" />,
}));

const session = (lifecycle: LivekitJsCallSession['lifecycle']): LivekitJsCallSession => ({
  roomId: '!room:example.org',
  lifecycle,
  failure: null,
  mediaReady: true,
  initialMedia: { microphone: true, camera: false, sound: true },
  hangup: async () => undefined,
});

const renderWith = (children: ReactNode, store = createStore()) =>
  render(<Provider store={store}>{children}</Provider>);

beforeEach(() => {
  mocks.callEmbed = undefined;
  mocks.selectedRoom = undefined;
  mocks.screenSize = 'Desktop';
});

describe('CallStatusRenderer', () => {
  it('shows the status bar during a LiveKit call', () => {
    const store = createStore();
    store.set(livekitJsCallAtom, session('active'));

    renderWith(<CallStatusRenderer />, store);

    expect(screen.getByTestId('livekit-call-status')).toBeInTheDocument();
  });

  it('keeps showing it while the call is still connecting', () => {
    const store = createStore();
    store.set(livekitJsCallAtom, session('joining-matrix'));

    renderWith(<CallStatusRenderer />, store);

    expect(screen.getByTestId('livekit-call-status')).toBeInTheDocument();
  });

  it('hides it once the call has failed', () => {
    const store = createStore();
    store.set(livekitJsCallAtom, session('failed'));

    renderWith(<CallStatusRenderer />, store);

    expect(screen.queryByTestId('livekit-call-status')).not.toBeInTheDocument();
  });

  it('hides it on mobile while the call room is open, as the embed path does', () => {
    mocks.screenSize = 'Mobile';
    mocks.selectedRoom = '!room:example.org';
    const store = createStore();
    store.set(livekitJsCallAtom, session('active'));

    renderWith(<CallStatusRenderer />, store);

    expect(screen.queryByTestId('livekit-call-status')).not.toBeInTheDocument();
  });

  it('prefers the Element Call bar when an embed is active', () => {
    mocks.callEmbed = { roomId: '!other:example.org' };
    const store = createStore();
    store.set(livekitJsCallAtom, session('active'));

    renderWith(<CallStatusRenderer />, store);

    expect(screen.getByTestId('element-call-status')).toBeInTheDocument();
    expect(screen.queryByTestId('livekit-call-status')).not.toBeInTheDocument();
  });

  it('shows the status bar during a native call', () => {
    const store = createStore();
    store.set(nativeCallAtom, {
      backend: 'livekit-mobile',
      roomId: '!room:example.org',
      callId: 'call-id',
      lifecycle: 'connected',
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
    } satisfies NativeCallSession);

    renderWith(<CallStatusRenderer />, store);

    expect(screen.getByTestId('native-call-status')).toBeInTheDocument();
  });

  it('hides the native bar once the call has failed', () => {
    const store = createStore();
    store.set(nativeCallAtom, {
      backend: 'livekit-mobile',
      roomId: '!room:example.org',
      callId: 'call-id',
      lifecycle: 'error',
      participants: [],
      microphoneEnabled: false,
      cameraEnabled: false,
      screenShareEnabled: false,
      setMicrophoneEnabled: async () => {},
      setCameraEnabled: async () => {},
      switchCamera: async () => {},
      listAudioRoutes: async () => [],
      selectAudioRoute: async () => {},
      hangup: async () => undefined,
    } satisfies NativeCallSession);

    renderWith(<CallStatusRenderer />, store);

    expect(screen.queryByTestId('native-call-status')).not.toBeInTheDocument();
  });

  it('renders nothing with no call at all', () => {
    const { container } = renderWith(<CallStatusRenderer />);
    expect(container).toBeEmptyDOMElement();
  });
});
