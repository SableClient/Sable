import { IEncryptedFile, IFileInfo, IThumbnailContent } from '$types/matrix/common';

export type SearchIndexEvent = {
  eventId: string;
  roomId: string;
  sender: string;

  msgtype: string;
  body: string;
  ts: number;

  hasLink: boolean;
  filename?: string;
  url?: string;
  info?: IFileInfo;
  file?: any;
};

export enum WorkerMessageTypeIn {
  Init,
  GetBackfillStates,
  SetBackfillState,
  EditEvents,
  RedactEvents,
  Index,
  Query,
  State,
  Clear,
  Flush,
}

export type IndexWorkerMessageIn =
  | {
      type: WorkerMessageTypeIn.Init;
      userId: string;
    }
  | {
      type: WorkerMessageTypeIn.GetBackfillStates;
    }
  | {
      type: WorkerMessageTypeIn.Query;
      id: string;
      term?: string;
      roomIds?: string[];
      senders?: string[];
      hasTypes?: string[];
    }
  | {
      type: WorkerMessageTypeIn.SetBackfillState;
      roomId: string;
      state: BackfillState;
    }
  |{
      type: WorkerMessageTypeIn.RedactEvents;
      eventIds: string[]
    }
    |{
      type: WorkerMessageTypeIn.EditEvents;
      events: Record<string, SearchIndexEvent>
    }
  | {
      type: WorkerMessageTypeIn.Index;
      events: SearchIndexEvent[];
    }
  | {
      type: WorkerMessageTypeIn.State;
    }
  | {
      type: WorkerMessageTypeIn.Clear;
    }
  | {
      type: WorkerMessageTypeIn.Flush;
    };

export enum WorkerMessageTypeOut {
  Ready,
  BackfillStatesDone,
  QueryResult,
  State,
  FlushDone,
}

export type IndexWorkerMessageOut =
  | {
      type: WorkerMessageTypeOut.Ready;
      indexedEventCount: number;
      roomCount: number;
    }
  | {
      type: WorkerMessageTypeOut.BackfillStatesDone;
      states: Record<string, BackfillState>;
    }
  | {
      type: WorkerMessageTypeOut.QueryResult;
      id: string;
      events: SearchIndexEvent[];
    }
  | {
      type: WorkerMessageTypeOut.State;
      indexedEventCount: number;
      roomCount: number;
    }
  | {
      type: WorkerMessageTypeOut.FlushDone;
    };

export type BackfillState = {
  token: string | null;
  done: boolean;
  indexedCount: number;
  oldestTs?: number;
};
