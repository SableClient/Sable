import type { RefObject } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { MatrixClient, Room } from '$types/matrix-sdk';
import { useSetAtom, useStore } from 'jotai';
import * as Sentry from '@sentry/react';
import type { ElementCallThemeKind } from '../plugins/call';
import { CallEmbed, ElementWidgetActions, useClientWidgetApiEvent } from '../plugins/call';
import { useMatrixClient } from './useMatrixClient';
import { ThemeKind, useTheme } from './useTheme';
import { callEmbedAtom } from '../state/callEmbed';
import { useResizeObserver } from './useResizeObserver';
import { CallControlState } from '../plugins/call/CallControlState';
import { useCallMembersChange, useCallSession } from './useCall';
import type { CallPreferences } from '../state/callPreferences';
import { createDebugLogger } from '../utils/debugLogger';
import { useClientConfig } from './useClientConfig';
import { callEmbedStartErrorAtom } from '$state/callEmbed';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { acquireCallOwner } from '$state/callOwner';
import { selectCallStartOwner } from '@sableclient/matrixrtc';
import { useLivekitJsCallManager } from '$features/call/livekitJsCallManager';
import { getNativeCallCapabilities } from '$features/call/nativeCallProbe';
import { getNativeCallManager } from '$features/call/nativeCallManager';
import { useAutoDiscoveryInfo } from './useAutoDiscoveryInfo';

const debugLog = createDebugLogger('useCallEmbed');

const CallEmbedContext = createContext<CallEmbed | undefined>(undefined);

export const CallEmbedContextProvider = CallEmbedContext.Provider;

export const useCallEmbed = (): CallEmbed | undefined => {
  const callEmbed = useContext(CallEmbedContext);

  return callEmbed;
};

const CallEmbedRefContext = createContext<RefObject<HTMLDivElement | null> | undefined>(undefined);
export const CallEmbedRefContextProvider = CallEmbedRefContext.Provider;
const useCallEmbedRef = (): RefObject<HTMLDivElement | null> => {
  const ref = useContext(CallEmbedRefContext);
  if (!ref) {
    throw new Error('CallEmbedRef is not provided!');
  }
  return ref;
};

const createCallEmbed = (
  mx: MatrixClient,
  room: Room,
  dm: boolean,
  themeKind: ElementCallThemeKind,
  container: HTMLElement,
  pref?: CallPreferences,
  elementCallUrl?: string
): CallEmbed => {
  const rtcSession = mx.matrixRTC.getRoomSession(room);
  const ongoing = rtcSession.memberships.length > 0;

  const intent = CallEmbed.getIntent(dm, ongoing, pref?.video);
  const widget = CallEmbed.getWidget(mx, room, intent, themeKind, elementCallUrl);
  const controlState = pref && new CallControlState(pref.microphone, pref.video, pref.sound);

  const embed = new CallEmbed(mx, room, widget, container, controlState);

  return embed;
};

export const useCallStart = (dm = false) => {
  const mx = useMatrixClient();
  const theme = useTheme();
  const clientConfig = useClientConfig();
  const setCallEmbed = useSetAtom(callEmbedAtom);
  const setCallEmbedStartError = useSetAtom(callEmbedStartErrorAtom);
  const callEmbedRef = useCallEmbedRef();
  const store = useStore();
  const discovery = useAutoDiscoveryInfo();
  const [newCallsEnabled] = useSetting(settingsAtom, 'newCallsEnabled');
  const livekitJsCallManager = useLivekitJsCallManager();
  const startPendingRef = useRef(false);

  const startCall = useCallback(
    (room: Room, pref?: CallPreferences) => {
      if (newCallsEnabled) {
        if (!livekitJsCallManager) {
          throw new Error('LiveKit JS call manager is not provided!');
        }
        if (startPendingRef.current) {
          debugLog.warn('call', 'Ignoring call start: a start is already in flight', {
            roomId: room.roomId,
          });
          return;
        }
        startPendingRef.current = true;
        // Resolved rather than cached in state so the first tap cannot race the
        // native capability probe and fall through to the JS backend.
        void getNativeCallCapabilities()
          .then((nativeCapabilities) => {
            const nativeCallAvailable =
              nativeCapabilities?.supported === true && nativeCapabilities.microphone;
            if (
              selectCallStartOwner({ newCallsEnabled, nativeCallAvailable }) === 'livekit-mobile'
            ) {
              getNativeCallManager(store).start({
                mx,
                room,
                discovery,
                dm,
                video: pref?.video,
                microphone: pref?.microphone,
                capabilities: nativeCapabilities,
              });
              return;
            }
            livekitJsCallManager.start({
              room,
              dm,
              video: pref?.video,
              microphone: pref?.microphone,
              sound: pref?.sound,
              audioDeviceId: pref?.audioDeviceId,
              videoDeviceId: pref?.videoDeviceId,
            });
          })
          .catch((err: unknown) => {
            debugLog.error('call', 'Failed to start call', {
              roomId: room.roomId,
              error: err instanceof Error ? err.message : String(err),
            });
          })
          .finally(() => {
            startPendingRef.current = false;
          });
        return;
      }
      const ownerLease = acquireCallOwner('element', room.roomId);
      if (!ownerLease) {
        debugLog.warn('call', 'Failed to start call: another call is already active', {
          roomId: room.roomId,
        });
        return;
      }
      const container = callEmbedRef.current;
      if (!container) {
        ownerLease.release();
        debugLog.error('call', 'Failed to start call: no embed container', {
          roomId: room.roomId,
        });
        Sentry.metrics.count('sable.call.start.error', 1, {
          attributes: { reason: 'no_container' },
        });
        throw new Error('Failed to start call, No embed container element found!');
      }
      try {
        debugLog.info('call', 'Starting call', { roomId: room.roomId, dm });
        Sentry.metrics.count('sable.call.start.attempt', 1, {
          attributes: { dm: String(dm) },
        });
        setCallEmbedStartError(null);
        const callEmbed = createCallEmbed(
          mx,
          room,
          dm,
          theme.kind,
          container,
          pref,
          clientConfig.elementCallUrl
        );
        setCallEmbed(callEmbed);
      } catch (err) {
        ownerLease.release();
        debugLog.error('call', 'Call embed creation failed', {
          roomId: room.roomId,
          error: err instanceof Error ? err.message : String(err),
        });
        Sentry.metrics.count('sable.call.start.error', 1, {
          attributes: { reason: 'embed_create_failed' },
        });
        throw err;
      }
    },
    [
      mx,
      dm,
      theme,
      setCallEmbed,
      callEmbedRef,
      store,
      discovery,
      clientConfig.elementCallUrl,
      setCallEmbedStartError,
      newCallsEnabled,
      livekitJsCallManager,
    ]
  );

  return startCall;
};

export const useCallJoined = (embed?: CallEmbed): boolean => {
  const [joined, setJoined] = useState(embed?.joined ?? false);

  useClientWidgetApiEvent(
    embed?.call,
    ElementWidgetActions.JoinCall,
    useCallback(() => {
      setJoined(true);
    }, [])
  );

  useEffect(() => {
    setJoined(embed?.joined ?? false);
  }, [embed]);

  return joined;
};

export const useCallHangupEvent = (embed: CallEmbed, callback: () => void) => {
  useClientWidgetApiEvent(embed.call, ElementWidgetActions.HangupCall, callback);
};

export const useCallMemberSoundSync = (embed: CallEmbed) => {
  const callSession = useCallSession(embed.room);
  useCallMembersChange(
    callSession,
    useCallback(() => embed.control.applySound(), [embed])
  );
};

export const useCallThemeSync = (embed: CallEmbed) => {
  const theme = useTheme();

  useEffect(() => {
    const name: ElementCallThemeKind = theme.kind === ThemeKind.Dark ? 'dark' : 'light';

    embed.setTheme(name);
  }, [theme.kind, embed]);
};

export const useCallEmbedPlacementSync = (
  containerViewRef: RefObject<HTMLDivElement | null>
): void => {
  const callEmbedRef = useCallEmbedRef();

  const syncCallEmbedPlacement = useCallback(() => {
    const embedEl = callEmbedRef.current;
    const container = containerViewRef.current;
    if (!embedEl || !container) return;

    const rect = container.getBoundingClientRect();

    embedEl.style.position = 'fixed';
    embedEl.style.top = `${rect.top}px`;
    embedEl.style.left = `${rect.left}px`;
    embedEl.style.width = `${rect.width}px`;
    embedEl.style.height = `${rect.height}px`;
  }, [callEmbedRef, containerViewRef]);

  useResizeObserver(
    syncCallEmbedPlacement,
    useCallback(() => containerViewRef.current, [containerViewRef])
  );

  useEffect(() => {
    let raf = 0;
    let last = '';
    const tick = () => {
      const embedEl = callEmbedRef.current;
      const container = containerViewRef.current;
      if (embedEl && container) {
        const rect = container.getBoundingClientRect();
        const key = `${rect.top}|${rect.left}|${rect.width}|${rect.height}`;
        if (key !== last) {
          last = key;
          embedEl.style.position = 'fixed';
          embedEl.style.top = `${rect.top}px`;
          embedEl.style.left = `${rect.left}px`;
          embedEl.style.width = `${rect.width}px`;
          embedEl.style.height = `${rect.height}px`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [callEmbedRef, containerViewRef]);
};
