import { act, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeCallSession } from '$state/nativeCall';
import { getDebugLogger, type LogEntry } from '$utils/debugLogger';
import type * as Platform from '$utils/platform';
import { NATIVE_CALL_PROBE_STORAGE_KEY } from './nativeCallProbe';
import {
  getNativeCallDiagnostics,
  serializeNativeCallDiagnostics,
  useNativeCallDiagnostics,
  useNativeCallProbeSession,
  NativeMediaControls,
  LivekitJsCallProbe,
} from './CallView';

const setMediaEnabled = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());

vi.mock('$plugins/call/callLifecycle', () => ({
  getState: vi.fn<() => Promise<unknown>>(),
  onState: vi.fn<(handler: unknown) => Promise<unknown>>(),
  setMediaEnabled,
}));

const desktopTauri = vi.hoisted(() => vi.fn<() => boolean>());
const mobileTauri = vi.hoisted(() => vi.fn<() => boolean>());

vi.mock('$utils/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof Platform>()),
  isDesktopTauri: desktopTauri,
  isMobileTauri: mobileTauri,
}));

const makeSession = (): NativeCallSession => ({
  roomId: '!room:example.org',
  connectionId: 'connection-id',
  lifecycle: 'connected',
  hangup: vi.fn<() => Promise<void>>().mockResolvedValue(),
});

const mediaSnapshot = {
  connectionId: 'connection-id',
  media: { microphone: true, camera: false, screenShare: false },
  capabilities: { microphone: true, camera: true, screenShare: false },
};

describe('native media controls', () => {
  beforeEach(() => {
    setMediaEnabled.mockReset();
    setMediaEnabled.mockResolvedValue({});
  });

  it('shows only advertised controls and reflects confirmed state', () => {
    render(<NativeMediaControls connectionId="connection-id" snapshot={mediaSnapshot} />);

    expect(screen.getByRole('button', { name: 'Turn off microphone' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Start camera' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Start screen sharing' })).not.toBeInTheDocument();
  });

  it('sends the requested media kind and state, then blocks duplicate requests', async () => {
    let resolveRequest!: (value: unknown) => void;
    setMediaEnabled.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );
    render(<NativeMediaControls connectionId="connection-id" snapshot={mediaSnapshot} />);

    const camera = screen.getByRole('button', { name: 'Start camera' });
    await act(async () => camera.click());
    expect(setMediaEnabled).toHaveBeenCalledWith({
      connectionId: 'connection-id',
      kind: 'camera',
      enabled: true,
    });
    expect(camera).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Turn off microphone' })).toBeDisabled();

    await act(async () => resolveRequest({}));
  });

  it('shows a recoverable error when the native command fails', async () => {
    setMediaEnabled.mockRejectedValueOnce(new Error('native failure'));
    render(<NativeMediaControls connectionId="connection-id" snapshot={mediaSnapshot} />);

    const camera = screen.getByRole('button', { name: 'Start camera' });
    await act(async () => camera.click());

    expect(screen.getByText('Couldn’t change camera.')).toBeInTheDocument();
    expect(camera).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Turn off microphone' })).toBeEnabled();
  });

  it('shows the safe failure code and records a sanitized diagnostic on rejection', async () => {
    const debugLogger = getDebugLogger();
    debugLogger.clear();
    debugLogger.setEnabled(true);
    setMediaEnabled.mockRejectedValueOnce({
      code: 'camera_failed',
      message: 'native camera failed',
    });
    render(<NativeMediaControls connectionId="connection-id" snapshot={mediaSnapshot} />);

    const camera = screen.getByRole('button', { name: 'Start camera' });
    await act(async () => camera.click());

    expect(screen.getByText('Couldn’t change camera (camera_failed).')).toBeInTheDocument();
    expect(camera).toBeEnabled();
    expect(getNativeCallDiagnostics(debugLogger.getLogs())).toContainEqual({
      stage: 'media control',
      code: 'camera_failed',
      errorName: 'UnknownError',
      errorMessage: 'native camera failed',
    });
  });

  it('supports media_unsupported and never logs raw invoke details', async () => {
    const debugLogger = getDebugLogger();
    debugLogger.clear();
    debugLogger.setEnabled(true);
    setMediaEnabled.mockRejectedValueOnce({
      code: 'media_unsupported',
      message: 'media kind is not supported on this platform',
    });
    const { rerender } = render(
      <NativeMediaControls connectionId="connection-id" snapshot={mediaSnapshot} />
    );

    await act(async () => screen.getByRole('button', { name: 'Start camera' }).click());
    expect(screen.getByText('Couldn’t change camera (media_unsupported).')).toBeInTheDocument();

    setMediaEnabled.mockRejectedValueOnce({
      code: 'https://evil.example/token?access_token=code-secret',
      message: 'invoke failed at https://evil.example/track?token=message-secret',
    });
    rerender(<NativeMediaControls connectionId="connection-id" snapshot={mediaSnapshot} />);
    await act(async () => screen.getByRole('button', { name: 'Start camera' }).click());

    expect(screen.getByText('Couldn’t change camera.')).toBeInTheDocument();
    const payload = serializeNativeCallDiagnostics(getNativeCallDiagnostics(debugLogger.getLogs()));
    expect(payload).not.toContain('evil.example');
    expect(payload).not.toContain('secret');
  });
});

describe('LiveKit JS connection probe', () => {
  it('renders connection and E2EE readiness without media controls', () => {
    render(
      <LivekitJsCallProbe session={{ lifecycle: 'active', failure: null }} onHangup={() => {}} />
    );

    expect(screen.getByText('LiveKit JS connection probe')).toBeInTheDocument();
    expect(screen.getByText('Connection: Connected')).toBeInTheDocument();
    expect(screen.getByText('E2EE readiness:')).toHaveTextContent('Ready');
    expect(
      screen.getByText('Connection-only experiment · media is not published')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /microphone|camera|screen/i })
    ).not.toBeInTheDocument();
  });

  it('uses safe status and setup failure text', () => {
    render(
      <LivekitJsCallProbe
        session={{ lifecycle: 'failed', failure: 'setup-failed' }}
        onHangup={() => {}}
      />
    );

    expect(screen.getByText('Connection: Connection failed')).toBeInTheDocument();
    expect(screen.getByText('E2EE readiness:')).toHaveTextContent('Unavailable');
    expect(screen.getByText('LiveKit JS connection setup failed.')).toBeInTheDocument();
    expect(screen.queryByText(/token|url|secret|error:/i)).not.toBeInTheDocument();
  });

  it('shows unavailable E2EE status and calls hangup from End', () => {
    const onHangup = vi.fn<() => void>();
    render(
      <LivekitJsCallProbe
        session={{ lifecycle: 'failed', failure: 'e2ee-unsupported' }}
        onHangup={onHangup}
      />
    );

    expect(screen.getByText('E2EE readiness:')).toHaveTextContent('Unavailable on this device');
    screen.getByRole('button', { name: 'End' }).click();
    expect(onHangup).toHaveBeenCalledOnce();
  });
});

describe('native call probe session gate', () => {
  beforeEach(() => {
    desktopTauri.mockReturnValue(true);
    mobileTauri.mockReturnValue(false);
    localStorage.clear();
    vi.stubEnv('VITE_ENABLE_NATIVE_CALL_PROBE', 'false');
  });

  it('hangs up a native session once when native calls are disabled', () => {
    const session = makeSession();
    const { rerender } = renderHook(
      ({ nativeCallsEnabled }) => useNativeCallProbeSession(session, nativeCallsEnabled),
      { initialProps: { nativeCallsEnabled: false } }
    );

    expect(session.hangup).toHaveBeenCalledTimes(1);

    rerender({ nativeCallsEnabled: false });
    expect(session.hangup).toHaveBeenCalledTimes(1);
  });

  it('keeps the native session when a developer override enables the probe', () => {
    localStorage.setItem(NATIVE_CALL_PROBE_STORAGE_KEY, '1');
    const session = makeSession();

    renderHook(() => useNativeCallProbeSession(session, false));

    expect(session.hangup).not.toHaveBeenCalled();
  });
});

describe('native call diagnostics', () => {
  const debugLogger = getDebugLogger();

  beforeEach(() => {
    debugLogger.clear();
    debugLogger.setEnabled(true);
  });

  it('filters controller call logs and keeps only sanitized diagnostic fields', () => {
    const logs = [
      {
        timestamp: 1,
        level: 'error',
        category: 'call',
        namespace: 'nativeCallController',
        message: 'Native call setup failed',
        data: {
          stage: 'connecting',
          errorName: 'Error',
          errorMessage: 'redacted',
          cause: { errorName: 'UnknownError', errorMessage: 'redacted', token: 'secret' },
          roomId: '!secret:example.org',
        },
      },
      {
        timestamp: 2,
        level: 'error',
        category: 'call',
        namespace: 'nativeCallController',
        message: 'Native call setup failed',
        data: { stage: 'authorizing', errorName: 'Error', errorMessage: 'redacted' },
      },
      {
        timestamp: 3,
        level: 'error',
        category: 'network',
        namespace: 'nativeCallController',
        message: 'Ignored',
        data: { stage: 'ignored' },
      },
    ] satisfies LogEntry[];

    expect(getNativeCallDiagnostics(logs)).toEqual([
      { stage: 'authorizing', errorName: 'Error', errorMessage: 'redacted' },
      {
        stage: 'connecting',
        errorName: 'Error',
        errorMessage: 'redacted',
        cause: { errorName: 'UnknownError', errorMessage: 'redacted' },
      },
    ]);
  });

  it('updates when a matching logger entry arrives', () => {
    const { result } = renderHook(() => useNativeCallDiagnostics());

    act(() => {
      debugLogger.log('error', 'call', 'nativeCallController', 'Native call setup failed', {
        stage: 'authorizing',
        errorName: 'Error',
        errorMessage: 'redacted',
      });
    });

    expect(result.current).toEqual([
      { stage: 'authorizing', errorName: 'Error', errorMessage: 'redacted' },
    ]);
  });

  it('copies only the safe diagnostic payload', () => {
    const diagnostics = getNativeCallDiagnostics([
      {
        timestamp: 1,
        level: 'error',
        category: 'call',
        namespace: 'nativeCallController',
        message: 'Native call setup failed',
        data: {
          code: 'connect_failed',
          stage: 'joining the call',
          errorName: 'Error',
          errorMessage: 'redacted',
          roomId: '!secret:example.org',
          token: 'secret-token',
        },
      },
    ] satisfies LogEntry[]);

    const payload = serializeNativeCallDiagnostics(diagnostics);

    expect(JSON.parse(payload)).toEqual([
      {
        code: 'connect_failed',
        stage: 'joining the call',
        errorName: 'Error',
        errorMessage: 'redacted',
      },
    ]);
    expect(payload).not.toContain('secret');
  });

  it('redacts unallowlisted diagnostic values in fields and nested causes', () => {
    const diagnostics = getNativeCallDiagnostics([
      {
        timestamp: 1,
        level: 'error',
        category: 'call',
        namespace: 'nativeCallController',
        message: 'Native call setup failed',
        data: {
          stage: 'https://evil.example/token?access_token=stage-secret',
          errorName: 'RawNativeException',
          errorMessage: 'https://evil.example/token?access_token=message-secret',
          cause: {
            errorName: 'RawCauseException token-secret',
            errorMessage: 'raw cause exception https://evil.example/cause-secret',
          },
        },
      },
    ] satisfies LogEntry[]);
    const payload = serializeNativeCallDiagnostics(diagnostics);

    expect(diagnostics).toEqual([
      {
        stage: 'redacted',
        errorName: 'redacted',
        errorMessage: 'redacted',
        cause: { errorName: 'redacted', errorMessage: 'redacted' },
      },
    ]);
    expect(payload).not.toContain('evil.example');
    expect(payload).not.toContain('secret');
    expect(payload).not.toContain('RawNativeException');
    expect(payload).not.toContain('RawCauseException');
  });

  it('redacts an unallowlisted lifecycle code in UI-derived diagnostics and copy payload', () => {
    const diagnostics = getNativeCallDiagnostics([
      {
        timestamp: 1,
        level: 'error',
        category: 'call',
        namespace: 'nativeCallController',
        message: 'Native call connection failed',
        data: {
          code: 'https://evil.example/token?access_token=code-secret',
          stage: 'connecting',
          errorName: 'Error',
          errorMessage: 'redacted',
        },
      },
    ] satisfies LogEntry[]);
    const payload = serializeNativeCallDiagnostics(diagnostics);

    expect(diagnostics).toEqual([
      {
        code: 'redacted',
        stage: 'connecting',
        errorName: 'Error',
        errorMessage: 'redacted',
      },
    ]);
    expect(payload).not.toContain('evil.example');
    expect(payload).not.toContain('code-secret');
  });
});
