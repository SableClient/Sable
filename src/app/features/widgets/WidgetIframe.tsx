import { useEffect, useRef, useState } from 'react';
import type { IWidget, IRoomEvent } from 'matrix-widget-api';
import { ClientWidgetApi, Widget, WidgetKind } from 'matrix-widget-api';
import type { IEvent, MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import { ClientEvent, Direction, MatrixEventEvent } from '$types/matrix-sdk';
import { createLogger } from '$utils/debug';
import { resolveWidgetUrl } from '$hooks/useRoomWidgets';
import type { CapabilityApprovalCallback } from './GenericWidgetDriver';
import { GenericWidgetDriver } from './GenericWidgetDriver';

const log = createLogger('WidgetIframe');

interface WidgetIframeProps {
  widget: IWidget;
  roomId: string;
  mx: MatrixClient;
  onCapabilityRequest?: CapabilityApprovalCallback;
}

export function WidgetIframe({ widget, roomId, mx, onCapabilityRequest }: WidgetIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const messagingRef = useRef<ClientWidgetApi | null>(null);
  const [, setReady] = useState(false);

  const userId = mx.getUserId() || '';
  const displayName = mx.getUser(userId)?.displayName || userId;
  const avatarUrl = mx.getUser(userId)?.avatarUrl || '';
  const resolvedUrl = resolveWidgetUrl(
    widget.url || '',
    roomId,
    userId,
    displayName,
    avatarUrl,
    widget.id,
    mx
  );

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return undefined;

    const mockWidget = new Widget(widget);
    const driver = new GenericWidgetDriver(
      mx,
      mockWidget,
      WidgetKind.Room,
      roomId,
      onCapabilityRequest
    );

    const messaging = new ClientWidgetApi(mockWidget, iframe, driver);
    messagingRef.current = messaging;
    messaging.setViewedRoomId(roomId);

    messaging.once('ready', () => setReady(true));

    // Set iframe src after ClientWidgetApi is listening for the load event.
    // This avoids a race condition where the iframe loads before the widget
    // API transport is ready to perform the capability handshake.
    iframe.src = resolvedUrl;

    messaging.on('action:org.matrix.msc2876.read_events', (ev: CustomEvent) => {
      const room = mx.getRoom(roomId);
      const events: Partial<IEvent>[] = [];
      const { type } = ev.detail.data;
      ev.preventDefault();
      if (room === null) {
        messaging.transport.reply(ev.detail, { events });
        return;
      }
      const state = room.getLiveTimeline().getState(Direction.Forward);
      if (state === undefined) {
        messaging.transport.reply(ev.detail, { events });
        return;
      }
      const stateEvents = state.events?.get(type);
      Array.from(stateEvents?.values() ?? []).forEach((eventObject: MatrixEvent) => {
        events.push(eventObject.event);
      });
      messaging.transport.reply(ev.detail, { events });
    });

    const readUpToMap: Record<string, string> = {};
    mx.getRooms().forEach((room) => {
      const roomEvents = room.getLiveTimeline()?.getEvents() || [];
      const last = roomEvents[roomEvents.length - 1];
      if (last) {
        const id = last.getId();
        if (id) readUpToMap[room.roomId] = id;
      }
    });

    const feedEvent = (ev: MatrixEvent): void => {
      if (!messagingRef.current) return;
      if (ev.isBeingDecrypted() || ev.isDecryptionFailure()) return;
      const raw = ev.getEffectiveEvent();
      messagingRef.current.feedEvent(raw as IRoomEvent).catch((err) => {
        log.warn('Failed to feed widget iframe event:', err);
      });
    };

    const onEvent = (ev: MatrixEvent): void => {
      mx.decryptEventIfNeeded(ev);
      feedEvent(ev);
    };

    const onDecrypted = (ev: MatrixEvent): void => {
      feedEvent(ev);
    };

    const onToDevice = async (ev: MatrixEvent): Promise<void> => {
      await mx.decryptEventIfNeeded(ev);
      if (ev.isDecryptionFailure()) return;
      await messagingRef.current?.feedToDevice(
        ev.getEffectiveEvent() as IRoomEvent,
        ev.isEncrypted()
      );
    };

    mx.on(ClientEvent.Event, onEvent);
    mx.on(MatrixEventEvent.Decrypted, onDecrypted);
    mx.on(ClientEvent.ToDeviceEvent, onToDevice);

    return () => {
      mx.removeListener(ClientEvent.Event, onEvent);
      mx.removeListener(MatrixEventEvent.Decrypted, onDecrypted);
      mx.removeListener(ClientEvent.ToDeviceEvent, onToDevice);
      messaging.stop();
      messaging.removeAllListeners();
      messagingRef.current = null;
      setReady(false);
    };
  }, [widget, roomId, mx, onCapabilityRequest, resolvedUrl]);

  const iframeTitle = widget.name ?? 'Widget';

  return (
    <iframe
      ref={iframeRef}
      title={iframeTitle}
      sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads"
      allow="camera;microphone;clipboard-write;display-capture;autoplay;encrypted-media"
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        display: 'block',
        flexGrow: 1,
      }}
    />
  );
}
