import type { RefObject } from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { MatrixRTCSession } from '$types/matrix-sdk';
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

const debugLog = createDebugLogger('useCallEmbed');

const CallEmbedContext = createContext<CallEmbed | undefined>(undefined);

export const CallEmbedContextProvider = CallEmbedContext.Provider;

export const useCallEmbed = (): CallEmbed | undefined => {
  const callEmbed = useContext(CallEmbedContext);

  return callEmbed;
};

const CallEmbedRefContext = createContext<RefObject<HTMLDivElement> | undefined>(undefined);
export const CallEmbedRefContextProvider = CallEmbedRefContext.Provider;
export const useCallEmbedRef = (): RefObject<HTMLDivElement> => {
  const ref = useContext(CallEmbedRefContext);
  if (!ref) {
    throw new Error('CallEmbedRef is not provided!');
  }
  return ref;
};

export const createCallEmbed = (
  mx: MatrixClient,
  room: Room,
  dm: boolean,
  themeKind: ElementCallThemeKind,
  container: HTMLElement,
  pref?: CallPreferences
): CallEmbed => {
  const rtcSession = mx.matrixRTC.getRoomSession(room);
  const ongoing =
    MatrixRTCSession.sessionMembershipsForRoom(room, rtcSession.sessionDescription).length > 0;

  const intent = CallEmbed.getIntent(dm, ongoing, pref?.video);
  const widget = CallEmbed.getWidget(mx, room, intent, themeKind);
  const controlState = pref && new CallControlState(pref.microphone, pref.video, pref.sound);

  const embed = new CallEmbed(mx, room, widget, container, controlState);

  return embed;
};

export const useCallStart = (dm = false) => {
  const mx = useMatrixClient();
  const theme = useTheme();
  const setCallEmbed = useSetAtom(callEmbedAtom);
  const callEmbedRef = useCallEmbedRef();

  const startCall = useCallback(
    (room: Room, pref?: CallPreferences) => {
      const container = callEmbedRef.current;
      if (!container) {
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
        const callEmbed = createCallEmbed(mx, room, dm, theme.kind, container, pref);
        setCallEmbed(callEmbed);
      } catch (err) {
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
    [mx, dm, theme, setCallEmbed, callEmbedRef]
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
    if (!embed) {
      setJoined(false);
    }
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
    syncCallEmbedPlacement();
    window.addEventListener('scroll', syncCallEmbedPlacement, true);
    return () => window.removeEventListener('scroll', syncCallEmbedPlacement, true);
  }, [syncCallEmbedPlacement]);
};
