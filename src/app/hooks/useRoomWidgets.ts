import { Room, MatrixEvent, MatrixClient } from '$types/matrix-sdk';
import { useCallback, useMemo } from 'react';
import { IWidget } from 'matrix-widget-api';
import { StateEvent } from '$types/matrix/room';
import { getStateEvents } from '$utils/room';
import { useStateEventCallback } from './useStateEventCallback';
import { useForceUpdate } from './useForceUpdate';

export interface RoomWidget extends IWidget {
  eventId?: string;
  sender?: string;
}

export const resolveWidgetUrl = (
  url: string,
  roomId: string,
  userId: string,
  displayName: string,
  avatarUrl: string,
  widgetId: string,
  mx?: MatrixClient
): string => {
  const deviceId = mx?.getDeviceId() ?? '';
  const baseUrl = mx?.baseUrl ?? '';
  const clientId = 'dev.nullptr.app';
  const lang = navigator.language || 'en';
  const theme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';

  let resolved = url
    .replaceAll('$matrix_user_id', encodeURIComponent(userId))
    .replaceAll('$matrix_room_id', encodeURIComponent(roomId))
    .replaceAll('$matrix_display_name', encodeURIComponent(displayName))
    .replaceAll('$matrix_avatar_url', encodeURIComponent(avatarUrl))
    .replaceAll('$matrix_widget_id', encodeURIComponent(widgetId))
    .replaceAll('$org.matrix.msc2873.client_id', encodeURIComponent(clientId))
    .replaceAll('$org.matrix.msc2873.client_theme', encodeURIComponent(theme))
    .replaceAll('$org.matrix.msc2873.client_language', encodeURIComponent(lang))
    .replaceAll('$org.matrix.msc3819.matrix_device_id', encodeURIComponent(deviceId))
    .replaceAll('$org.matrix.msc4039.matrix_base_url', encodeURIComponent(baseUrl));

  try {
    const u = new URL(resolved);
    if (!u.searchParams.has('widgetId')) {
      u.searchParams.set('widgetId', widgetId);
    }
    if (!u.searchParams.has('parentUrl')) {
      u.searchParams.set('parentUrl', window.location.href);
    }
    resolved = u.toString();
  } catch {
    // URL parsing failed, return as-is
  }

  return resolved;
};

/**
 * Enrich a plain widget URL with standard Matrix template variables.
 * Used when storing the widget URL in room state so that resolveWidgetUrl
 * can substitute actual values at render time.
 */
export const enrichWidgetUrl = (rawUrl: string): string => {
  if (rawUrl.includes('$matrix_') || rawUrl.includes('$org.matrix.')) {
    return rawUrl;
  }

  const templateParams = [
    'matrix_user_id=$matrix_user_id',
    'matrix_display_name=$matrix_display_name',
    'matrix_avatar_url=$matrix_avatar_url',
    'matrix_room_id=$matrix_room_id',
    'matrix_widget_id=$matrix_widget_id',
    'theme=$org.matrix.msc2873.client_theme',
    'matrix_client_id=$org.matrix.msc2873.client_id',
    'matrix_client_language=$org.matrix.msc2873.client_language',
    'matrix_device_id=$org.matrix.msc3819.matrix_device_id',
    'matrix_base_url=$org.matrix.msc4039.matrix_base_url',
  ].join('&');

  try {
    const u = new URL(rawUrl);
    if (u.hash.includes('?')) {
      return `${rawUrl}&${templateParams}`;
    }
    if (u.hash) {
      return `${rawUrl}?${templateParams}`;
    }
    const separator = u.search ? '&' : '?';
    return `${rawUrl}${separator}${templateParams}`;
  } catch {
    return rawUrl;
  }
};

export const useRoomWidgets = (room: Room): RoomWidget[] => {
  const [updateCount, forceUpdate] = useForceUpdate();

  useStateEventCallback(
    room.client,
    useCallback(
      (event) => {
        if (event.getRoomId() === room.roomId && event.getType() === StateEvent.RoomWidget) {
          forceUpdate();
        }
      },
      [room.roomId, forceUpdate]
    )
  );

  return useMemo(() => {
    const events: MatrixEvent[] = getStateEvents(room, StateEvent.RoomWidget);

    return events.reduce<RoomWidget[]>((widgets, event) => {
      const content = event.getContent();
      if (!content?.url || Object.keys(content).length === 0) return widgets;

      const stateKey = event.getStateKey();
      if (!stateKey) return widgets;

      widgets.push({
        id: content.id || stateKey,
        creatorUserId: content.creatorUserId || event.getSender() || '',
        type: content.type || 'm.custom',
        url: content.url,
        name: content.name || 'Widget',
        data: content.data || {},
        waitForIframeLoad: content.waitForIframeLoad ?? true,
        eventId: event.getId(),
        sender: event.getSender() || undefined,
      });

      return widgets;
    }, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, updateCount]);
};
