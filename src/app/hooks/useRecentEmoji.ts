import { useCallback, useState } from 'react';
import type { MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import { ClientEvent } from '$types/matrix-sdk';
import { useMatrixEvent } from '$hooks/useMatrixEvent';

import { getRecentEmojis } from '$plugins/recent-emoji';
import type { IEmoji } from '$plugins/emoji';
import { CustomAccountDataEvent } from '$types/matrix/accountData';

export const useRecentEmoji = (mx: MatrixClient, limit?: number): IEmoji[] => {
  const [recentEmoji, setRecentEmoji] = useState(() => getRecentEmojis(mx, limit));

  const handleAccountData = useCallback(
    (event: MatrixEvent) => {
      if (
        event.getType() !== (CustomAccountDataEvent.RecentEmoji as string) &&
        event.getType() !== (CustomAccountDataEvent.LegacyElementRecentEmoji as string)
      ) {
        return;
      }
      setRecentEmoji(getRecentEmojis(mx, limit));
    },
    [mx, limit]
  );

  useMatrixEvent(mx, ClientEvent.AccountData, handleAccountData);

  return recentEmoji;
};
