import * as Sentry from '@sentry/react';
import type { MatrixClient, RoomMessageEventContent } from '$types/matrix-sdk';

type SendImmediateMessageArgs = {
  content: RoomMessageEventContent;
  isEncrypted: boolean;
  mx: MatrixClient;
  roomId: string;
  threadRootId?: string;
  txnId?: string;
};

export const sendImmediateMessage = ({
  content,
  isEncrypted,
  mx,
  roomId,
  threadRootId,
  txnId,
}: SendImmediateMessageArgs): Promise<{ event_id: string }> =>
  Sentry.startSpan(
    {
      name: 'message.send',
      op: 'matrix.message',
      attributes: { encrypted: String(isEncrypted) },
    },
    () => mx.sendMessage(roomId, threadRootId ?? null, content, txnId)
  );
