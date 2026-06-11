/** A plain, serializable event suitable for passing into/out of the search worker. */
export type IndexableEvent = {
  eventId: string;
  roomId: string;
  sender: string;
  /** Matrix msgtype, e.g. 'm.text', 'm.image', 'm.file', 'm.audio', 'm.video'. */
  msgtype: string;
  body: string;
  ts: number;
  // ── Media fields (present for m.image / m.file / m.audio / m.video) ──
  /** mxc:// URL for unencrypted media. */
  url?: string;
  /** EncryptedFile descriptor for encrypted media (contains url + key material). */
  file?: Record<string, unknown>;
  /** Dimensions, mimetype, size, thumbnail info, etc. */
  info?: Record<string, unknown>;
  /** Original filename (m.file). */
  filename?: string;
};

export type BackfillState = {
  /**
   * Backward pagination token to resume from, or null to start from the
   * room's live timeline token (first run, or expired-token recovery).
   */
  token: string | null;
  /** True once we've reached the beginning of the room history. */
  done: boolean;
  /** How many events for this room are currently in the index. */
  indexedCount: number;
  /**
   * Unix-ms timestamp of the oldest event indexed for this room across all
   * sessions. Primary purpose: when the stored token has expired and we must
   * restart from the live timeline's backward token, we compare each page's
   * events against this frontier and skip those already covered (ts >= oldestTs)
   * rather than re-indexing them. In normal operation (valid token) this field
   * is never used as a filter — it only records progress.
   */
  oldestTs?: number;
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
    }
  | {
      type: 'FLUSH';
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
    }
  | {
      type: 'FLUSH_DONE';
    }
  | {
      type: '_sentry_breadcrumb';
      category: string;
      message: string;
      level?: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
      data?: Record<string, unknown>;
    }
  | {
      type: '_sentry_exception';
      error: Error;
      tags?: Record<string, string>;
      contexts?: Record<string, Record<string, unknown>>;
    };
