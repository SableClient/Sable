import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient, Room } from '$types/matrix-sdk';
import { MatrixClientProvider } from '$hooks/useMatrixClient';
import { AutoDiscoveryInfoProvider } from '$hooks/useAutoDiscoveryInfo';
import { CallEmbedRefContextProvider } from '$hooks/useCallEmbed';
import { getSettings, settingsAtom } from '$state/settings';
import { livekitJsCallAtom } from '$state/livekitJsCall';
import { nativeCallAtom, type NativeCallSession } from '$state/nativeCall';
import {
  type LivekitJsCallManager,
  LivekitJsCallManagerProvider,
  useLivekitJsCallManager,
} from './livekitJsCallManager';
import type { LivekitJsControllerState } from './livekitJsController';

vi.mock('$hooks/useTheme', () => ({
  ThemeKind: { Light: 'light', Dark: 'dark' },
  useTheme: () => ({ kind: 'light' }),
}));

vi.mock('$hooks/useClientConfig', () => ({
  useClientConfig: () => ({ elementCallUrl: undefined }),
}));

const { createControllerMock } = vi.hoisted(() => ({
  createControllerMock: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock('./livekitJsController', () => ({
  createLivekitJsController: createControllerMock,
}));

type ControllerListener = (state: Readonly<LivekitJsControllerState>) => void;

type FakeController = {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  subscribe: (listener: ControllerListener) => () => void;
  getState: () => LivekitJsControllerState;
  emit: (state: Partial<LivekitJsControllerState>) => void;
  listenerCount: () => number;
};

const makeFakeController = (): FakeController => {
  const listeners = new Set<ControllerListener>();
  let state: LivekitJsControllerState = {
    lifecycle: 'idle',
    failure: null,
    mediaFailure: null,
    e2ee: { ready: false, localOutboundIdentity: null, keyIndex: null, lastImportFailure: null },
  };
  const snapshot = (): LivekitJsControllerState => ({ ...state, e2ee: { ...state.e2ee } });
  return {
    connect: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
    disconnect: vi.fn<() => Promise<void>>(async () => undefined),
    getState: () => snapshot(),
    subscribe: (listener) => {
      listeners.add(listener);
      listener(snapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    emit: (next) => {
      state = { ...state, ...next };
      listeners.forEach((listener) => listener(snapshot()));
    },
    listenerCount: () => listeners.size,
  };
};

const room = { roomId: '!room:example.org' } as Room;

const makeNativeSession = (lifecycle: NativeCallSession['lifecycle']): NativeCallSession => ({
  backend: 'livekit-mobile',
  roomId: room.roomId,
  callId: 'native-call-id',
  lifecycle,
  microphoneEnabled: true,
  cameraEnabled: false,
  hangup: async () => undefined,
});

const memberships: string[] = [];
const mx = {
  matrixRTC: {
    getRoomSession: vi.fn<() => unknown>(() => ({ memberships })),
  },
} as unknown as MatrixClient;

type Harness = {
  store: ReturnType<typeof createStore>;
  controllers: FakeController[];
  wrapper: ({ children }: { children?: ReactNode }) => ReactNode;
  managers: Array<LivekitJsCallManager | undefined>;
  Consumer: () => null;
};

const createHarness = (
  settingsOverrides: { livekitJsCallsEnabled?: boolean; livekitJsMediaTestEnabled?: boolean } = {}
): Harness => {
  const store = createStore();
  store.set(settingsAtom, { ...getSettings(), ...settingsOverrides });
  const controllers: FakeController[] = [];
  createControllerMock.mockImplementation(() => {
    const controller = makeFakeController();
    controllers.push(controller);
    return controller;
  });
  const managers: Array<LivekitJsCallManager | undefined> = [];
  const Consumer = (): null => {
    managers.push(useLivekitJsCallManager());
    return null;
  };
  const embedRef = { current: null };
  const wrapper = ({ children }: { children?: ReactNode }) => (
    <JotaiProvider store={store}>
      <MatrixClientProvider value={mx}>
        <AutoDiscoveryInfoProvider value={{ 'org.matrix.msc4143.rtc_foci': [] } as never}>
          <CallEmbedRefContextProvider value={embedRef}>
            <LivekitJsCallManagerProvider>{children}</LivekitJsCallManagerProvider>
          </CallEmbedRefContextProvider>
        </AutoDiscoveryInfoProvider>
      </MatrixClientProvider>
    </JotaiProvider>
  );
  return { store, controllers, wrapper, managers, Consumer };
};

const currentManager = (harness: Harness): LivekitJsCallManager => {
  const manager = harness.managers[harness.managers.length - 1];
  expect(manager).toBeDefined();
  return manager!;
};

describe('LivekitJsCallManagerProvider', () => {
  beforeEach(() => {
    createControllerMock.mockReset();
  });

  it('start then consumer unmount/replacement does not disconnect the controller', () => {
    const harness = createHarness();
    const view = render(
      <harness.wrapper>
        <harness.Consumer />
      </harness.wrapper>
    );
    const controller = harness.controllers[0]!;
    act(() => {
      currentManager(harness).start({ room, video: true });
    });
    expect(controller.connect).toHaveBeenCalledTimes(1);
    expect(controller.connect.mock.calls[0]![0]).toMatchObject({ room, callIntent: 'video' });

    // Consumer unmounts (prescreen replaced by call view) while provider persists.
    view.rerender(<harness.wrapper>{undefined}</harness.wrapper>);

    expect(controller.disconnect).not.toHaveBeenCalled();
    expect(controller.listenerCount()).toBe(1);

    // A replacement consumer mounts and still sees the same controller/manager.
    view.rerender(
      <harness.wrapper>
        <harness.Consumer />
      </harness.wrapper>
    );
    expect(controller.disconnect).not.toHaveBeenCalled();
  });

  it('explicit end via session hangup disconnects exactly once', async () => {
    const harness = createHarness();
    render(
      <harness.wrapper>
        <harness.Consumer />
      </harness.wrapper>
    );
    const controller = harness.controllers[0]!;
    act(() => {
      currentManager(harness).start({ room, video: false });
    });
    act(() => {
      controller.emit({ lifecycle: 'active', room: {} as never });
    });
    const session = harness.store.get(livekitJsCallAtom);
    expect(session?.roomId).toBe(room.roomId);
    expect(session?.lifecycle).toBe('active');

    await act(async () => {
      await session!.hangup();
    });

    expect(controller.disconnect).toHaveBeenCalledTimes(1);
  });

  it('child passive effect (auto-join) can start on initial mount', () => {
    const harness = createHarness({ livekitJsCallsEnabled: true });
    const AutoJoinChild = (): null => {
      const manager = useLivekitJsCallManager();
      useEffect(() => {
        manager?.start({ room, video: false });
      }, [manager]);
      return null;
    };

    render(
      <harness.wrapper>
        <AutoJoinChild />
      </harness.wrapper>
    );

    const controller = harness.controllers[0]!;
    expect(controller.connect).toHaveBeenCalledTimes(1);
    expect(controller.connect.mock.calls[0]![0]).toMatchObject({ room, callIntent: 'audio' });
  });

  it('stale disconnect completion does not clear a replacement session', async () => {
    const harness = createHarness({ livekitJsMediaTestEnabled: false });
    let resolveOldDisconnect: (() => void) | undefined;
    createControllerMock.mockImplementationOnce(() => {
      const controller = {
        ...makeFakeController(),
        disconnect: vi.fn<() => Promise<void>>(
          () =>
            new Promise<void>((resolve) => {
              resolveOldDisconnect = resolve;
            })
        ),
      };
      harness.controllers.push(controller);
      return controller;
    });
    const view = render(
      <harness.wrapper>
        <harness.Consumer />
      </harness.wrapper>
    );
    const oldController = harness.controllers[0]!;
    act(() => {
      currentManager(harness).start({ room, video: false });
    });

    // Deliberate replacement via manual media toggle while old disconnect pends.
    act(() => {
      harness.store.set(settingsAtom, { ...getSettings(), livekitJsMediaTestEnabled: true });
    });
    const newController = harness.controllers[1]!;
    expect(newController).toBeDefined();
    expect(oldController.disconnect).toHaveBeenCalledTimes(1);

    // New controller starts and publishes before the old disconnect resolves.
    act(() => {
      currentManager(harness).start({ room, video: false });
      newController.emit({ lifecycle: 'active', room: {} as never });
    });
    expect(harness.store.get(livekitJsCallAtom)?.lifecycle).toBe('active');

    await act(async () => {
      resolveOldDisconnect!();
      await Promise.resolve();
    });

    expect(harness.store.get(livekitJsCallAtom)?.lifecycle).toBe('active');
    expect(harness.store.get(livekitJsCallAtom)?.roomId).toBe(room.roomId);
    view.unmount();
  });

  it('provider unmount disconnects exactly once', async () => {
    const harness = createHarness();
    const view = render(<harness.wrapper>{undefined}</harness.wrapper>);
    const controller = harness.controllers[0]!;

    view.unmount();

    await waitFor(() => {
      expect(controller.disconnect).toHaveBeenCalledTimes(1);
    });
    expect(controller.listenerCount()).toBe(0);
    expect(harness.store.get(livekitJsCallAtom)).toBeUndefined();
  });

  it('manual media setting change deliberately replaces the controller', async () => {
    const harness = createHarness({ livekitJsMediaTestEnabled: false });
    render(<harness.wrapper>{undefined}</harness.wrapper>);
    expect(harness.controllers).toHaveLength(1);
    const first = harness.controllers[0]!;
    expect(createControllerMock.mock.calls[0]![1]).toEqual({ manualMediaTest: false });

    act(() => {
      harness.store.set(settingsAtom, { ...getSettings(), livekitJsMediaTestEnabled: true });
    });

    await waitFor(() => {
      expect(first.disconnect).toHaveBeenCalledTimes(1);
      expect(harness.controllers).toHaveLength(2);
    });
    expect(createControllerMock.mock.calls[1]![1]).toEqual({ manualMediaTest: true });
  });

  it('multiple consumers share one controller for one call', () => {
    const harness = createHarness({ livekitJsCallsEnabled: true });
    render(
      <harness.wrapper>
        <harness.Consumer />
        <harness.Consumer />
        <harness.Consumer />
      </harness.wrapper>
    );
    const controller = harness.controllers[0]!;

    // Prescreen starts the call.
    act(() => {
      harness.managers[0]!.start({ room, video: false });
    });
    act(() => {
      controller.emit({ lifecycle: 'joining-matrix' });
    });
    // Room header and auto-join attempt the same call while one is active.
    act(() => {
      harness.managers[1]!.start({ room, video: false });
      harness.managers[2]!.start({ room, video: false });
    });

    expect(controller.connect).toHaveBeenCalledTimes(1);
  });

  it('refuses to start while a native call is active and publishes no failed session', () => {
    const harness = createHarness();
    harness.store.set(nativeCallAtom, makeNativeSession('connected'));
    render(
      <harness.wrapper>
        <harness.Consumer />
      </harness.wrapper>
    );
    const controller = harness.controllers[0]!;

    act(() => {
      currentManager(harness).start({ room, video: false });
    });

    expect(controller.connect).not.toHaveBeenCalled();
    expect(harness.store.get(livekitJsCallAtom)).toBeUndefined();
  });

  it('starts when the native session is in a terminal error state', () => {
    const harness = createHarness();
    harness.store.set(nativeCallAtom, makeNativeSession('error'));
    render(
      <harness.wrapper>
        <harness.Consumer />
      </harness.wrapper>
    );
    const controller = harness.controllers[0]!;

    act(() => {
      currentManager(harness).start({ room, video: false });
    });

    expect(controller.connect).toHaveBeenCalledTimes(1);
  });
});
