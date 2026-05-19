/** A plain, serializable event suitable for passing into/out of the search worker. */
export type IndexableEvent = {
  eventId: string;
  roomId: string;
  sender: string;
  /** Matrix msgtype, e.g. 'm.text', 'm.image', 'm.file', 'm.audio', 'm.video'. */
  msgtype: string;
  body: string;
  ts: number;
};

export type BackfillState = {
  /** Pagination token to resume backward pagination, or null when at the beginning. */
  token: string | null;
  /** True once we've reached the beginning of the room history. */
  done: boolean;
  /** How many events for this room are currently in the index. */
  indexedCount: number;
};

// ── Main → Worker ──────────────────────────────────────────────────────────

export type WorkerInMessage =
  | {
      type: 'INIT';
      userId: string;
      maxMessagesPerRoom: number;
    }
  | {
      type: 'INDEX_EVENTS';
      events: IndexableEvent[];
    }
  | {
      type: 'QUERY';
      id: string;
      term: string;
      roomIds?: string[];
      senders?: string[];
      /** SearchHasType values to filter by, e.g. ['image', 'link']. */
      hasTypes?: string[];
    }
  | {
      type: 'SET_BACKFILL_STATE';
      roomId: string;
      state: BackfillState;
    }
  | {
      type: 'GET_BACKFILL_STATES';
    }
  | {
      type: 'GET_STATS';
    }
  | {
      type: 'CLEAR_INDEX';
    };

// ── Worker → Main ──────────────────────────────────────────────────────────

export type WorkerOutMessage =
  | {
      type: 'READY';
      indexedEventCount: number;
      roomCount: number;
    }
  | {
      type: 'QUERY_RESULT';
      id: string;
      events: IndexableEvent[];
    }
  | {
      type: 'BACKFILL_STATES';
      states: Record<string, BackfillState>;
    }
  | {
      type: 'STATS';
      indexedEventCount: number;
      roomCount: number;
      estimatedBytes: number;
    }
  | {
      type: 'ERROR';
      message: string;
    };
