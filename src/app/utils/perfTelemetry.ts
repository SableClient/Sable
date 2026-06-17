import * as Sentry from '@sentry/react';

type RoomNavigationTarget = 'home' | 'dm' | 'space';
type SpaceNavigationSource = 'space' | 'room';

type PendingRoomNavigation = {
  roomId: string;
  startedAt: number;
  target: RoomNavigationTarget;
};

type PendingSpaceNavigation = {
  spaceId: string;
  startedAt: number;
  source: SpaceNavigationSource;
};

const APP_BOOT_AT = performance.now();
let shellReadyAt: number | undefined;
let firstRoomListRecorded = false;
let pendingRoomNavigation: PendingRoomNavigation | undefined;
let pendingRoomTimelineRender: PendingRoomNavigation | undefined;
const pendingSpaceNavigations = new Map<string, PendingSpaceNavigation>();
const shellReadyListeners = new Set<() => void>();

export function markStartupShellReady(): void {
  if (shellReadyAt !== undefined) return;
  shellReadyAt = performance.now();
  shellReadyListeners.forEach((listener) => listener());
}

export function markStartupRoomListReady(
  surface: 'home' | 'direct' | 'space',
  itemCount: number
): void {
  if (firstRoomListRecorded) return;
  firstRoomListRecorded = true;

  const now = performance.now();
  Sentry.metrics.distribution('sable.startup.first_room_list_ms', now - APP_BOOT_AT, {
    attributes: {
      surface,
      item_bucket: itemCount > 0 ? 'non_empty' : 'empty',
    },
  });

  if (shellReadyAt !== undefined) {
    Sentry.metrics.distribution(
      'sable.startup.first_room_list_after_shell_ms',
      now - shellReadyAt,
      {
        attributes: {
          surface,
          item_bucket: itemCount > 0 ? 'non_empty' : 'empty',
        },
      }
    );
  }
}

export function beginRoomNavigation(roomId: string, target: RoomNavigationTarget): void {
  const pending = {
    roomId,
    target,
    startedAt: performance.now(),
  };
  pendingRoomNavigation = pending;
  pendingRoomTimelineRender = pending;
}

export function completeRoomNavigation(
  roomId: string,
  reason: 'timeline_cached' | 'subscription_data' | 'classic_sync',
  eventCount: number
): void {
  if (!pendingRoomNavigation || pendingRoomNavigation.roomId !== roomId) return;

  Sentry.metrics.distribution(
    'sable.navigation.room_switch_ms',
    performance.now() - pendingRoomNavigation.startedAt,
    {
      attributes: {
        target: pendingRoomNavigation.target,
        reason,
        event_bucket: eventCount > 0 ? 'non_empty' : 'empty',
      },
    }
  );

  pendingRoomNavigation = undefined;
}

export function completeRoomTimelineRender(
  roomId: string,
  reason: 'live_timeline' | 'permalink_context',
  eventCount: number
): void {
  if (!pendingRoomTimelineRender || pendingRoomTimelineRender.roomId !== roomId) return;

  Sentry.metrics.distribution(
    'sable.navigation.room_timeline_render_ms',
    performance.now() - pendingRoomTimelineRender.startedAt,
    {
      attributes: {
        target: pendingRoomTimelineRender.target,
        reason,
        event_bucket: eventCount > 0 ? 'non_empty' : 'empty',
      },
    }
  );

  pendingRoomTimelineRender = undefined;
}

export function beginSpaceNavigation(spaceId: string, source: SpaceNavigationSource): void {
  pendingSpaceNavigations.set(spaceId, {
    spaceId,
    source,
    startedAt: performance.now(),
  });
}

export function completeSpaceNavigation(
  spaceId: string,
  reason: 'list_ready' | 'empty_space',
  itemCount: number
): void {
  const pending = pendingSpaceNavigations.get(spaceId);
  if (!pending) return;

  Sentry.metrics.distribution(
    'sable.navigation.space_switch_ms',
    performance.now() - pending.startedAt,
    {
      attributes: {
        source: pending.source,
        reason,
        item_bucket: itemCount > 0 ? 'non_empty' : 'empty',
      },
    }
  );

  pendingSpaceNavigations.delete(spaceId);
}

export function isStartupShellReady(): boolean {
  return shellReadyAt !== undefined;
}

export function subscribeStartupShellReady(listener: () => void): () => void {
  shellReadyListeners.add(listener);
  return () => {
    shellReadyListeners.delete(listener);
  };
}
