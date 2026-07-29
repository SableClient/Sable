import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  Badge,
  Box,
  Button,
  color,
  Header,
  IconButton,
  Scroll,
  Spinner,
  Text,
  toRem,
  Tooltip,
  TooltipProvider,
} from 'folds';
import { useAtomValue } from 'jotai';
import { ContainerColor } from '$styles/ContainerColor.css';
import { useRoom } from '$hooks/useRoom';
import { useCallStartCapabilities } from './useCallStartCapabilities';

import { useCallMembers, useCallSession } from '$hooks/useCall';
import { useCallEmbed, useCallEmbedPlacementSync, useCallJoined } from '$hooks/useCallEmbed';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import * as css from './styles.css';
import { CallMemberRenderer } from './CallMemberCard';
import { PrescreenControls } from './PrescreenControls';
import { callEmbedAtom, callEmbedStartErrorAtom } from '$state/callEmbed';
import { canJoinCall } from './callStartCapabilities';
import type { NativeCallSession } from '$state/nativeCall';
import { nativeCallAtom } from '$state/nativeCall';
import type { LivekitJsCallSession } from '$state/livekitJsCall';
import { livekitJsCallAtom } from '$state/livekitJsCall';
import { isNativeCallProbeEnabled } from './nativeCallProbe';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { createDebugLogger, getDebugLogger, type LogEntry } from '$utils/debugLogger';
import { copyToClipboard } from '$utils/dom';
import {
  Microphone,
  MicrophoneSlash,
  ScreenShare,
  VideoCamera,
  VideoCameraSlash,
  sizedIcon,
} from '$components/icons/phosphor';
import { getState, onState, setMediaEnabled, type MediaKind } from '$plugins/call/callLifecycle';
import { canRenderLivekitJsMediaTest, LivekitJsMediaTestSurface } from './LivekitJsMediaTest';

type NativeMediaSnapshot = {
  connectionId: string;
  media: {
    microphone: boolean;
    camera: boolean;
    screenShare: boolean;
  };
  capabilities: {
    microphone: boolean;
    camera: boolean;
    screenShare: boolean;
  };
};

type NativeMediaKind = MediaKind;

const nativeMediaDebug = createDebugLogger('nativeCallController');

const allowlistedErrorField = (
  error: unknown,
  property: 'code' | 'name' | 'message',
  allowlist: Set<string>
): string | undefined => {
  const value = isRecord(error) ? error[property] : undefined;
  return typeof value === 'string' && allowlist.has(value) ? value : undefined;
};

// Records a bounded, allowlisted diagnostic for a failed media toggle and
// returns the safe failure code (if known). Raw invoke messages, URLs, and
// tokens are never logged.
const logMediaControlFailure = (error: unknown): string | undefined => {
  const code = allowlistedErrorField(error, 'code', nativeCallCodes);
  nativeMediaDebug.error('call', 'Native media control failed', {
    stage: 'media control',
    code: code ?? 'unknown',
    errorName: allowlistedErrorField(error, 'name', nativeCallErrorNames) ?? 'UnknownError',
    errorMessage: allowlistedErrorField(error, 'message', nativeCallErrorMessages) ?? 'redacted',
  });
  return code === 'unknown' ? undefined : code;
};

const toNativeMediaSnapshot = (state: unknown): NativeMediaSnapshot | undefined => {
  if (!isRecord(state) || !isRecord(state.media) || !isRecord(state.capabilities)) return undefined;
  if (typeof state.connectionId !== 'string') return undefined;

  const media = state.media;
  const capabilities = state.capabilities;
  if (
    typeof media.microphone !== 'boolean' ||
    typeof media.camera !== 'boolean' ||
    typeof media.screenShare !== 'boolean' ||
    typeof capabilities.microphone !== 'boolean' ||
    typeof capabilities.camera !== 'boolean' ||
    typeof capabilities.screenShare !== 'boolean'
  ) {
    return undefined;
  }

  return {
    connectionId: state.connectionId,
    media: {
      microphone: media.microphone,
      camera: media.camera,
      screenShare: media.screenShare,
    },
    capabilities: {
      microphone: capabilities.microphone,
      camera: capabilities.camera,
      screenShare: capabilities.screenShare,
    },
  };
};

export function NativeMediaControls({
  connectionId,
  snapshot,
}: {
  connectionId: string;
  snapshot: NativeMediaSnapshot | undefined;
}) {
  const [pending, setPending] = useState<NativeMediaKind | undefined>();
  const [error, setError] = useState<string>();

  const toggle = useCallback(
    async (kind: NativeMediaKind, enabled: boolean) => {
      if (pending || !snapshot) return;
      setPending(kind);
      setError(undefined);
      try {
        await setMediaEnabled({
          connectionId,
          kind,
          enabled,
        });
      } catch (toggleError) {
        const code = logMediaControlFailure(toggleError);
        setError(
          `Couldn’t change ${kind === 'screen_share' ? 'screen sharing' : kind}${
            code ? ` (${code})` : ''
          }.`
        );
      } finally {
        setPending(undefined);
      }
    },
    [connectionId, pending, snapshot]
  );

  if (!snapshot) return null;

  const controls: Array<{
    kind: NativeMediaKind;
    enabled: boolean;
    supported: boolean;
    label: string;
    icon: typeof Microphone;
  }> = [
    {
      kind: 'microphone',
      enabled: snapshot.media.microphone,
      supported: snapshot.capabilities.microphone,
      label: snapshot.media.microphone ? 'Turn off microphone' : 'Turn on microphone',
      icon: snapshot.media.microphone ? Microphone : MicrophoneSlash,
    },
    {
      kind: 'camera',
      enabled: snapshot.media.camera,
      supported: snapshot.capabilities.camera,
      label: snapshot.media.camera ? 'Stop camera' : 'Start camera',
      icon: snapshot.media.camera ? VideoCamera : VideoCameraSlash,
    },
    {
      kind: 'screen_share',
      enabled: snapshot.media.screenShare,
      supported: snapshot.capabilities.screenShare,
      label: snapshot.media.screenShare ? 'Stop screen sharing' : 'Start screen sharing',
      icon: ScreenShare,
    },
  ];

  return (
    <Box direction="Column" alignItems="Center" gap="100">
      <Box alignItems="Center" gap="200">
        {controls.map(({ kind, enabled, supported, label, icon }) => {
          if (!supported) return null;
          const busy = pending === kind;
          return (
            <TooltipProvider
              key={kind}
              position="Top"
              delay={500}
              tooltip={
                <Tooltip>
                  <Text size="T200">{label}</Text>
                </Tooltip>
              }
            >
              {(anchorRef) => (
                <IconButton
                  ref={anchorRef}
                  aria-label={label}
                  variant={
                    enabled
                      ? kind === 'microphone'
                        ? 'Surface'
                        : 'Success'
                      : kind === 'microphone'
                        ? 'Warning'
                        : 'Surface'
                  }
                  fill="Soft"
                  radii="300"
                  size="300"
                  outlined
                  disabled={busy || pending !== undefined}
                  onClick={() => void toggle(kind, !enabled)}
                >
                  {busy ? (
                    <Spinner size="100" />
                  ) : (
                    sizedIcon(icon, '100', {
                      filled: kind === 'microphone' ? !enabled : enabled,
                    })
                  )}
                </IconButton>
              )}
            </TooltipProvider>
          );
        })}
      </Box>
      {error && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          {error}
        </Text>
      )}
    </Box>
  );
}

function useNativeMediaSnapshot(
  connectionId: string,
  active: boolean
): NativeMediaSnapshot | undefined {
  const [snapshot, setSnapshot] = useState<NativeMediaSnapshot>();

  useEffect(() => {
    if (!active) {
      setSnapshot(undefined);
      return undefined;
    }
    let current = true;
    void (async () => {
      try {
        const next = toNativeMediaSnapshot(await getState());
        if (current && next?.connectionId === connectionId) setSnapshot(next);
      } catch {
        // The probe can still receive a state event if the initial read fails.
      }
    })();
    const unlisten = onState((state) => {
      const next = toNativeMediaSnapshot(state);
      if (next?.connectionId === connectionId) setSnapshot(next);
    });
    return () => {
      current = false;
      void (async () => {
        (await unlisten)();
      })();
    };
  }, [active, connectionId]);

  return snapshot;
}

function LivekitServerMissingMessage() {
  return (
    <Text style={{ margin: 'auto', color: color.Critical.Main }} size="L400" align="Center">
      Your homeserver does not support calling. You can still join calls started by others.
    </Text>
  );
}

function WebRTCMissingError() {
  return (
    <Text style={{ margin: 'auto', color: color.Critical.Main }} size="L400" align="Center">
      Your browser does not support WebRTC, which is required for calling.
    </Text>
  );
}

function JoinMessage({
  hasParticipant,
  livekitSupported,
  rtcSupported,
}: {
  hasParticipant?: boolean;
  livekitSupported?: boolean;
  rtcSupported?: boolean;
}) {
  if (rtcSupported === false) {
    return <WebRTCMissingError />;
  }

  if (hasParticipant) return null;

  if (livekitSupported === false) {
    return <LivekitServerMissingMessage />;
  }

  return (
    <Text style={{ margin: 'auto' }} size="L400" align="Center">
      Voice chat&apos;s empty - be the first to hop in!
    </Text>
  );
}

function NoPermissionMessage() {
  return (
    <Text style={{ margin: 'auto' }} size="L400" align="Center">
      You don&apos;t have permission to join!
    </Text>
  );
}

function AlreadyInCallMessage() {
  return (
    <Text style={{ margin: 'auto', color: color.Warning.Main }} size="L400" align="Center">
      Already in another call - end the current call to join.
    </Text>
  );
}

function WidgetPreparationErrorMessage({ message }: { message: string }) {
  return (
    <Text style={{ margin: 'auto', color: color.Critical.Main }} size="L400" align="Center">
      {message}
    </Text>
  );
}

function NativeCallProbe({
  lifecycle,
  connectionId,
  error,
  onHangup,
}: {
  lifecycle: string;
  connectionId: string;
  error?: string;
  onHangup: () => void;
}) {
  const diagnostics = useNativeCallDiagnostics();
  const mediaSnapshot = useNativeMediaSnapshot(connectionId, lifecycle !== 'error');

  return (
    <Box alignItems="Center" justifyContent="Center" direction="Column" gap="200" grow="Yes">
      <Text size="L400">Native call: {lifecycle}</Text>
      <Text size="T300" align="Center">
        Experimental native call
      </Text>
      <NativeMediaControls connectionId={connectionId} snapshot={mediaSnapshot} />
      {error && (
        <Text style={{ color: color.Critical.Main }} size="T300" align="Center">
          {error}
        </Text>
      )}
      <Box direction="Column" gap="100" style={{ width: '100%', maxWidth: toRem(382) }}>
        <Text size="T300">Native diagnostics</Text>
        <Box direction="Column" gap="100" style={{ maxHeight: toRem(140), overflowY: 'auto' }}>
          {diagnostics.length > 0 ? (
            diagnostics.map((diagnostic) => (
              <Text key={JSON.stringify(diagnostic)} size="T300">
                {diagnostic.code && `${diagnostic.code} · `}
                {diagnostic.stage} · {diagnostic.errorName}: {diagnostic.errorMessage}
                {diagnostic.cause &&
                  ` (cause: ${diagnostic.cause.errorName}: ${diagnostic.cause.errorMessage})`}
              </Text>
            ))
          ) : (
            <Text size="T300">No native call diagnostics yet.</Text>
          )}
        </Box>
        <Button
          size="300"
          variant="Secondary"
          fill="Soft"
          radii="300"
          onClick={() => void copyToClipboard(serializeNativeCallDiagnostics(diagnostics))}
        >
          <Text as="span" size="B300">
            Copy diagnostics
          </Text>
        </Button>
      </Box>
      <Button size="300" variant="Critical" fill="Soft" radii="300" onClick={onHangup}>
        <Text as="span" size="B300">
          End
        </Text>
      </Button>
    </Box>
  );
}

const livekitJsLifecycleLabels: Record<LivekitJsCallSession['lifecycle'], string> = {
  idle: 'Idle',
  'joining-matrix': 'Joining call',
  provisioning: 'Preparing connection',
  'connecting-livekit': 'Connecting to LiveKit',
  active: 'Connected',
  stopping: 'Ending connection',
  failed: 'Connection failed',
};

function LivekitJsE2EEStatus({
  lifecycle,
  failure,
}: Pick<LivekitJsCallSession, 'lifecycle' | 'failure'>) {
  if (failure === 'e2ee-unsupported') {
    return <Text style={{ color: color.Warning.Main }}>Unavailable on this device</Text>;
  }
  if (failure === 'setup-failed') {
    return <Text style={{ color: color.Warning.Main }}>Unavailable</Text>;
  }
  if (failure === 'e2ee-import-failed') {
    return <Text style={{ color: color.Critical.Main }}>Failed to prepare</Text>;
  }
  if (lifecycle === 'active') return <Text>Ready</Text>;
  return <Text>Waiting</Text>;
}

export function LivekitJsCallProbe({
  session,
  onHangup,
}: {
  session: Pick<LivekitJsCallSession, 'lifecycle' | 'failure'>;
  onHangup: () => void;
}) {
  const failureMessage =
    session.failure === 'e2ee-unsupported'
      ? 'End-to-end encryption is unavailable on this device.'
      : session.failure === 'e2ee-import-failed'
        ? 'End-to-end encryption setup failed.'
        : session.failure === 'setup-failed'
          ? 'LiveKit JS connection setup failed.'
          : undefined;

  return (
    <Box alignItems="Center" justifyContent="Center" direction="Column" gap="200" grow="Yes">
      <Text size="L400">LiveKit JS connection probe</Text>
      <Text size="T300" align="Center">
        Connection-only experiment · media is not published
      </Text>
      <Box direction="Column" gap="100" style={{ width: '100%', maxWidth: toRem(382) }}>
        <Text size="T300">Connection: {livekitJsLifecycleLabels[session.lifecycle]}</Text>
        <Text size="T300">
          E2EE readiness: <LivekitJsE2EEStatus {...session} />
        </Text>
        {failureMessage && (
          <Text style={{ color: color.Critical.Main }} size="T300">
            {failureMessage}
          </Text>
        )}
      </Box>
      <Button size="300" variant="Critical" fill="Soft" radii="300" onClick={onHangup}>
        <Text as="span" size="B300">
          End
        </Text>
      </Button>
    </Box>
  );
}

export type NativeCallDiagnostic = {
  code?: string;
  stage?: string;
  errorName?: string;
  errorMessage?: string;
  cause?: {
    errorName?: string;
    errorMessage?: string;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const safeString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const nativeCallStages = new Set([
  'joining the call',
  'no transport',
  'authorizing',
  'connecting',
  'media control',
]);

const nativeCallCodes = new Set([
  'actor_unavailable',
  'audio_failed',
  'busy',
  'camera_failed',
  'close_failed',
  'connect_failed',
  'media_unsupported',
  'screen_share_failed',
  'stale_connection',
  'video_failed',
  'unknown',
]);

const nativeCallErrorNames = new Set([
  'AggregateError',
  'AbortError',
  'DataError',
  'DOMException',
  'Error',
  'EvalError',
  'InvalidStateError',
  'NetworkError',
  'NotAllowedError',
  'NotSupportedError',
  'OperationError',
  'QuotaExceededError',
  'RangeError',
  'ReferenceError',
  'SecurityError',
  'SyntaxError',
  'TimeoutError',
  'TypeError',
  'URIError',
  'UnknownError',
]);

const nativeCallErrorMessages = new Set([
  'MatrixRTC device unavailable',
  'MatrixRTC membership listener setup failed',
  'MatrixRTC membership publication failed',
  'MatrixRTC membership wait cancelled',
  'MatrixRTC slot was not assigned',
  'No LiveKit transport available',
  'media kind is not supported on this platform',
  'native audio failed',
  'native camera failed',
  'native screen share failed',
  'native video failed',
  'redacted',
]);

const allowlistedString = (value: unknown, allowlist: Set<string>): string | undefined => {
  const string = safeString(value);
  if (string === undefined) return undefined;
  return allowlist.has(string) ? string : 'redacted';
};

const safeCause = (value: unknown): NativeCallDiagnostic['cause'] | undefined => {
  if (!isRecord(value)) return undefined;
  const errorName = allowlistedString(value.errorName, nativeCallErrorNames);
  const errorMessage = allowlistedString(value.errorMessage, nativeCallErrorMessages);
  if (!errorName && !errorMessage) return undefined;
  return { ...(errorName ? { errorName } : {}), ...(errorMessage ? { errorMessage } : {}) };
};

export const getNativeCallDiagnostics = (logs: readonly LogEntry[]): NativeCallDiagnostic[] =>
  logs
    .filter((entry) => entry.category === 'call' && entry.namespace === 'nativeCallController')
    .reduce<LogEntry[]>((sorted, entry) => {
      const index = sorted.findIndex((candidate) => candidate.timestamp < entry.timestamp);
      if (index === -1) sorted.push(entry);
      else sorted.splice(index, 0, entry);
      return sorted;
    }, [])
    .map((entry) => {
      const data = isRecord(entry.data) ? entry.data : {};
      const code = allowlistedString(data.code, nativeCallCodes);
      const stage = allowlistedString(data.stage, nativeCallStages);
      const errorName = allowlistedString(data.errorName, nativeCallErrorNames);
      const errorMessage = allowlistedString(data.errorMessage, nativeCallErrorMessages);
      const cause = safeCause(data.cause);
      return {
        ...(code ? { code } : {}),
        ...(stage ? { stage } : {}),
        ...(errorName ? { errorName } : {}),
        ...(errorMessage ? { errorMessage } : {}),
        ...(cause ? { cause } : {}),
      };
    });

export const serializeNativeCallDiagnostics = (
  diagnostics: readonly NativeCallDiagnostic[]
): string => JSON.stringify(diagnostics, null, 2);

export function useNativeCallDiagnostics(): NativeCallDiagnostic[] {
  const [diagnostics, setDiagnostics] = useState<NativeCallDiagnostic[]>(() =>
    getNativeCallDiagnostics(getDebugLogger().getLogs())
  );

  useEffect(() => {
    const debugLogger = getDebugLogger();
    const update = (entry?: LogEntry): void => {
      if (entry && (entry.category !== 'call' || entry.namespace !== 'nativeCallController')) {
        return;
      }
      setDiagnostics(getNativeCallDiagnostics(debugLogger.getLogs()));
    };
    return debugLogger.addListener(update);
  }, []);

  return diagnostics;
}

function CallPrescreen() {
  const room = useRoom();
  const callEmbed = useAtomValue(callEmbedAtom);
  const callEmbedStartError = useAtomValue(callEmbedStartErrorAtom);
  const callJoined = useCallJoined(callEmbed);
  const callStartCapabilities = useCallStartCapabilities(room);

  const callSession = useCallSession(room);
  const callMembers = useCallMembers(room, callSession);
  const hasParticipant = callMembers.length > 0;
  const showEmbedError =
    callEmbed?.roomId === room.roomId && !callJoined && callEmbedStartError !== null;
  const embedErrorMessage =
    callEmbedStartError?.kind === 'capability'
      ? 'Call setup failed because required call capabilities were rejected.'
      : 'Call setup failed while preparing the embedded call app.';

  const canJoin = canJoinCall(callStartCapabilities, hasParticipant);

  return (
    <Scroll variant="Surface" hideTrack>
      <Box className={css.CallViewContent} alignItems="Center" justifyContent="Center">
        <Box style={{ maxWidth: toRem(382), width: '100%' }} direction="Column" gap="100">
          {hasParticipant && (
            <Header size="300">
              <Box grow="Yes" alignItems="Center">
                <Text size="L400">Participant</Text>
              </Box>
              <Badge variant="Critical" fill="Solid" size="400">
                <Text as="span" size="L400" truncate>
                  {callMembers.length} Live
                </Text>
              </Badge>
            </Header>
          )}
          <CallMemberRenderer members={callMembers} />
          <PrescreenControls canJoin={canJoin} />
          <Box className={css.PrescreenMessage} alignItems="Center">
            {!callStartCapabilities.inAnotherCall &&
              (callStartCapabilities.hasCallMemberPermission ? (
                <JoinMessage
                  hasParticipant={hasParticipant}
                  livekitSupported={callStartCapabilities.livekitSupported}
                  rtcSupported={callStartCapabilities.webRTCSupported}
                />
              ) : (
                <NoPermissionMessage />
              ))}
            {callStartCapabilities.inAnotherCall && <AlreadyInCallMessage />}
            {showEmbedError && (
              <WidgetPreparationErrorMessage
                message={callEmbedStartError.message || embedErrorMessage}
              />
            )}
          </Box>
        </Box>
      </Box>
    </Scroll>
  );
}

type CallJoinedProps = {
  containerRef: RefObject<HTMLDivElement>;
};

function CallJoined({ containerRef }: CallJoinedProps) {
  return (
    <Box grow="Yes" direction="Column" style={{ position: 'relative' }}>
      <Box grow="Yes" ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </Box>
  );
}

export function useNativeCallProbeSession(
  nativeCallForRoom: NativeCallSession | undefined,
  nativeCallsEnabled: boolean
): boolean {
  const nativeCallProbeEnabled = isNativeCallProbeEnabled(nativeCallsEnabled);
  const hungUpSession = useRef<NativeCallSession | undefined>(undefined);

  useEffect(() => {
    if (
      !nativeCallForRoom ||
      nativeCallProbeEnabled ||
      hungUpSession.current === nativeCallForRoom
    ) {
      return;
    }

    hungUpSession.current = nativeCallForRoom;
    void nativeCallForRoom.hangup();
  }, [nativeCallForRoom, nativeCallProbeEnabled]);

  return nativeCallProbeEnabled;
}

interface CallViewProps {
  resizable?: boolean;
}

export function CallView({ resizable }: CallViewProps) {
  const room = useRoom();
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;

  const callViewRef = useRef<HTMLDivElement>(null);
  const callContainerRef = useRef<HTMLDivElement>(null);
  useCallEmbedPlacementSync(callContainerRef);

  const callEmbed = useCallEmbed();
  const callJoined = useCallJoined(callEmbed);
  const nativeCall = useAtomValue(nativeCallAtom);
  const livekitJsCall = useAtomValue(livekitJsCallAtom);
  const [nativeCallsEnabled] = useSetting(settingsAtom, 'nativeCallsEnabled');
  const [livekitJsMediaTestEnabled] = useSetting(settingsAtom, 'livekitJsMediaTestEnabled');

  const nativeCallSessionForRoom = nativeCall?.roomId === room.roomId ? nativeCall : undefined;
  const nativeCallProbeEnabled = useNativeCallProbeSession(
    nativeCallSessionForRoom,
    nativeCallsEnabled
  );
  const nativeCallForRoom = nativeCallProbeEnabled ? nativeCallSessionForRoom : undefined;
  const livekitJsCallForRoom = livekitJsCall?.roomId === room.roomId ? livekitJsCall : undefined;
  const currentJoined =
    !nativeCallForRoom && !livekitJsCallForRoom && callEmbed?.roomId === room.roomId && callJoined;

  const [heightRatio, setHeightRatio] = useState(isMobile ? 0.3 : 0.72);
  const [availableHeight, setAvailableHeight] = useState(0);

  useEffect(() => {
    if (!resizable || !callViewRef.current) return undefined;
    const container = callViewRef.current.parentElement?.parentElement;
    if (!container) return undefined;

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setAvailableHeight(entries[0].contentRect.height);
      }
    });
    observer.observe(container);
    setAvailableHeight(container.getBoundingClientRect().height);

    return () => observer.disconnect();
  }, [resizable]);

  const [isDragging, setIsDragging] = useState(false);
  const isResizing = useRef(false);
  const previousBodyUserSelect = useRef<string | null>(null);

  const handleMove = useCallback(
    (clientY: number) => {
      if (!isResizing.current || !callViewRef.current) return;
      const { top } = callViewRef.current.getBoundingClientRect();
      const newHeight = clientY - top;
      const baseHeight = availableHeight || window.innerHeight;
      const ratio = newHeight / baseHeight;
      const clampedRatio = Math.max(0.2, Math.min(ratio, 0.8));
      setHeightRatio(clampedRatio);
    },
    [availableHeight]
  );

  const handleMouseMove = useCallback((e: MouseEvent) => handleMove(e.clientY), [handleMove]);
  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      if (e.touches[0]) handleMove(e.touches[0].clientY);
    },
    [handleMove]
  );

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    setIsDragging(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', stopResizing);
    document.body.style.userSelect = previousBodyUserSelect.current ?? '';
    previousBodyUserSelect.current = null;
  }, [handleMouseMove, handleTouchMove]);

  const startResizing = useCallback(() => {
    isResizing.current = true;
    setIsDragging(true);
    if (previousBodyUserSelect.current === null) {
      previousBodyUserSelect.current = document.body.style.userSelect;
    }
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', stopResizing);
    document.body.style.userSelect = 'none';
  }, [handleMouseMove, handleTouchMove, stopResizing]);

  useEffect(
    () => () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopResizing);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', stopResizing);
      document.body.style.userSelect = previousBodyUserSelect.current ?? '';
      previousBodyUserSelect.current = null;
    },
    [handleMouseMove, handleTouchMove, stopResizing]
  );

  return (
    <Box
      ref={callViewRef}
      grow="Yes"
      className={ContainerColor({ variant: 'Surface' })}
      style={{
        position: 'relative',
        minWidth: toRem(280),
        height: resizable
          ? availableHeight > 0
            ? `${availableHeight * heightRatio}px`
            : `${heightRatio * 100}dvh`
          : undefined,
        borderBottom: `1px solid var(--sable-surface-container-line)`,
        zIndex: 20,
        backgroundColor: currentJoined ? 'transparent' : undefined,
        pointerEvents: currentJoined ? 'none' : 'all',
      }}
    >
      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            cursor: 'ns-resize',
            pointerEvents: 'all',
          }}
        />
      )}

      {!currentJoined && !nativeCallForRoom && !livekitJsCallForRoom && <CallPrescreen />}
      {nativeCallForRoom ? (
        <NativeCallProbe
          lifecycle={nativeCallForRoom.lifecycle}
          connectionId={nativeCallForRoom.connectionId}
          error={nativeCallForRoom.error}
          onHangup={() => void nativeCallForRoom.hangup()}
        />
      ) : canRenderLivekitJsMediaTest(livekitJsMediaTestEnabled, livekitJsCallForRoom) ? (
        <LivekitJsMediaTestSurface
          room={livekitJsCallForRoom.room}
          media={livekitJsCallForRoom.media}
          onHangup={() => void livekitJsCallForRoom.hangup()}
        />
      ) : livekitJsCallForRoom ? (
        <LivekitJsCallProbe
          session={livekitJsCallForRoom}
          onHangup={() => void livekitJsCallForRoom.hangup()}
        />
      ) : (
        <CallJoined containerRef={callContainerRef} />
      )}

      {resizable && (
        <button
          type="button"
          onMouseDown={startResizing}
          onTouchStart={startResizing}
          aria-label="Resize call view"
          style={{
            position: 'absolute',
            bottom: '-20px',
            left: 0,
            right: 0,
            height: '20px',
            cursor: 'ns-resize',
            zIndex: 100,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            padding: 0,
            outline: 'none',
            pointerEvents: 'all',
            touchAction: 'none',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '4px',
              marginTop: '2px',
              borderRadius: '2px',
              background: 'var(--sable-surface-container-line)',
              opacity: 0.8,
            }}
          />
        </button>
      )}
    </Box>
  );
}
