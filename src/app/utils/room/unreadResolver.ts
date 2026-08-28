import type { MatrixClient, Room } from '$types/matrix-sdk';
import type { UnreadInfo } from '$types/matrix/room';
import { Direction, KnownMembership, NotificationCountType } from '$types/matrix-sdk';
import {
  countTimelineUnread,
  getFullyReadEventId,
  hasAnyReadReceipt,
  isReadBoundaryLoaded,
} from './unread';

const PAGE_SIZE = 50;
const MAX_BACKFILLED_EVENTS = 250;

export type UnreadResolutionUpdate = (room: Room, unreadInfo?: UnreadInfo) => void;

type PendingRoom = {
  room: Room;
  initialEventCount: number;
};

const lastLoadedEventId = (room: Room): string | undefined => {
  const events = room.getLiveTimeline().getEvents();
  return events[events.length - 1]?.getId();
};

export class UnreadCountResolver {
  private readonly pending = new Set<string>();

  private readonly settled = new Map<string, string | undefined>();

  private pumping = false;

  private disposed = false;

  public constructor(
    private readonly mx: MatrixClient,
    private readonly onUpdate: UnreadResolutionUpdate
  ) {}

  public queue(roomId: string): void {
    if (this.disposed) return;
    if (this.settled.has(roomId)) {
      const room = this.mx.getRoom(roomId);
      if (room && this.settled.get(roomId) === lastLoadedEventId(room)) return;
      this.settled.delete(roomId);
    }
    this.pending.add(roomId);
    void this.pump();
  }

  public dispose(): void {
    this.disposed = true;
    this.pending.clear();
  }

  private settle(room: Room): void {
    this.settled.set(room.roomId, lastLoadedEventId(room));
    this.pending.delete(room.roomId);
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.disposed) return;
    this.pumping = true;
    try {
      while (this.pending.size > 0 && !this.disposed) {
        const userId = this.mx.getUserId();
        if (!userId) break;

        const roomIds = [...this.pending];
        this.pending.clear();

        let active: PendingRoom[] = roomIds
          .map((roomId) => this.mx.getRoom(roomId))
          .filter(
            (room): room is Room =>
              !!room && room.getMyMembership() === (KnownMembership.Join as string)
          )
          .map((room) => ({
            room,
            initialEventCount: room.getLiveTimeline().getEvents().length,
          }))
          .toSorted((a, b) => b.room.getLastActiveTimestamp() - a.room.getLastActiveTimestamp());

        while (active.length > 0 && !this.disposed) {
          const next: PendingRoom[] = [];
          for (const state of active) {
            if (this.disposed) break;
            // eslint-disable-next-line no-await-in-loop
            if (await this.advanceRoom(state, userId)) next.push(state);
          }
          active = next;
        }
      }
    } finally {
      this.pumping = false;
      if (this.pending.size > 0 && !this.disposed) void this.pump();
    }
  }

  /** Backfills one page. Returns true while the room needs more pages. */
  private async advanceRoom(state: PendingRoom, userId: string): Promise<boolean> {
    const { room } = state;
    if (room.getMyMembership() !== (KnownMembership.Join as string)) {
      this.settle(room);
      return false;
    }

    if (isReadBoundaryLoaded(room, userId)) {
      this.settle(room);
      this.onUpdate(room, undefined);
      return false;
    }

    const loadedCount = room.getLiveTimeline().getEvents().length;
    if (loadedCount >= state.initialEventCount + MAX_BACKFILLED_EVENTS) {
      this.settle(room);
      this.publishLowerBound(room, userId);
      return false;
    }

    const tokenBefore = room.getLiveTimeline().getPaginationToken(Direction.Backward);
    try {
      await this.mx.scrollback(room, PAGE_SIZE);
    } catch {
      this.settle(room);
      return false;
    }
    if (this.disposed) return false;

    if (isReadBoundaryLoaded(room, userId)) {
      this.settle(room);
      this.onUpdate(room, undefined);
      return false;
    }
    const tokenAfter = room.getLiveTimeline().getPaginationToken(Direction.Backward);
    if (tokenAfter === tokenBefore) {
      this.settle(room);
      return false;
    }
    return true;
  }

  private publishLowerBound(room: Room, userId: string): void {
    const fullyReadId = getFullyReadEventId(room);
    if (fullyReadId && !hasAnyReadReceipt(room, userId)) return;

    const counted = countTimelineUnread(room, userId, { stopAtOwnEvent: true });
    if (counted.total === 0 && counted.highlight === 0) return;
    if (counted.total <= room.getUnreadNotificationCount(NotificationCountType.Total)) return;
    this.onUpdate(room, {
      roomId: room.roomId,
      highlight: counted.highlight,
      total: counted.total,
      estimated: true,
    });
  }
}
