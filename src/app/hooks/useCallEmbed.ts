import type { RefObject } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MatrixClient, Room } from '$types/matrix-sdk';
import { useSetAtom } from 'jotai';
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
import { useAutoDiscoveryInfo } from './useAutoDiscoveryInfo';
import { useStore } from 'jotai';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { livekitJsCallAtom, isLivekitJsCallActive } from '$state/livekitJsCall';
import { acquireCallOwner } from '$state/callOwner';
import { createLivekitJsController } from '$features/call/livekitJsController';
import { isLivekitJsCallProbeEnabled } from '$features/call/livekitJsCallProbe';
import { selectCallStartOwner } from '$features/call/callStartSelection';

const debugLog = createDebugLogger('useCallEmbed');

const CallEmbedContext = createContext<CallEmbed | undefined>(undefined);

export const CallEmbedContextProvider = CallEmbedContext.Provider;

export const useCallEmbed = (): CallEmbed | undefined => {
  const callEmbed = useContext(CallEmbedContext);

  return callEmbed;
};

const CallEmbedRefContext = createContext<RefObject<HTMLDivElement> | undefined>(undefined);
export const CallEmbedRefContextProvider = CallEmbedRefContext.Provider;
const useCallEmbedRef = (): RefObject<HTMLDivElement> => {
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
  const [livekitJsCallsEnabled] = useSetting(settingsAtom, 'livekitJsCallsEnabled');
  const [livekitJsMediaTestEnabled] = useSetting(settingsAtom, 'livekitJsMediaTestEnabled');
  const discovery = useAutoDiscoveryInfo();
  const livekitJsRoomIdRef = useRef<string | undefined>(undefined);
  const livekitJsController = useMemo(
    () => createLivekitJsController(undefined, { manualMediaTest: livekitJsMediaTestEnabled }),
    [livekitJsMediaTestEnabled]
  );

  useEffect(() => {
    const unsubscribe = livekitJsController.subscribe((controllerState) => {
      const roomId = livekitJsRoomIdRef.current;
      if (!roomId) return;
      if (controllerState.lifecycle === 'idle') {
        store.set(livekitJsCallAtom, undefined);
        return;
      }
      store.set(livekitJsCallAtom, {
        roomId,
        lifecycle: controllerState.lifecycle,
        failure: controllerState.failure,
        room: controllerState.lifecycle === 'active' ? controllerState.room : undefined,
        media: controllerState.lifecycle === 'active' ? controllerState.media : undefined,
        hangup: () => livekitJsController.disconnect(),
      });
    });
    return () => {
      unsubscribe();
      livekitJsRoomIdRef.current = undefined;
      void livekitJsController.disconnect().finally(() => {
        store.set(livekitJsCallAtom, undefined);
      });
    };
  }, [livekitJsController, store]);

  const startCall = useCallback(
    (room: Room, pref?: CallPreferences) => {
      const startOwner = selectCallStartOwner({
        livekitJsProbeEnabled: isLivekitJsCallProbeEnabled(livekitJsCallsEnabled),
      });
      if (startOwner === 'livekit-js') {
        if (store.get(callEmbedAtom) || isLivekitJsCallActive(store.get(livekitJsCallAtom))) return;
        livekitJsRoomIdRef.current = room.roomId;
        void livekitJsController
          .connect({
            mx,
            room,
            discovery,
            callIntent: pref?.video ? 'video' : 'audio',
            dm,
            ongoing: mx.matrixRTC.getRoomSession(room).memberships.length > 0,
          })
          .catch(() => undefined);
        return;
      }
      const ownerLease = acquireCallOwner('element', room.roomId);
      if (!ownerLease) return;
      const container = callEmbedRef.current;
      if (!container) {
        ownerLease.release();
        debugLog.error('call', 'Failed to start call — no embed container', {
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
      clientConfig.elementCallUrl,
      setCallEmbedStartError,
      store,
      discovery,
      livekitJsCallsEnabled,
      livekitJsController,
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

export const useCallEmbedPlacementSync = (containerViewRef: RefObject<HTMLDivElement>): void => {
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
