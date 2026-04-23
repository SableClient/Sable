import { useEffect, useState } from 'react';
import type { MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import { ClientEvent } from '$types/matrix-sdk';

import { getRecentEmojis } from '$plugins/recent-emoji';
import type { IEmoji } from '$plugins/emoji';
import { CustomAccountDataEvent } from '$types/matrix/accountData';

export const useRecentEmoji = (mx: MatrixClient, limit?: number): IEmoji[] => {
  const [recentEmoji, setRecentEmoji] = useState(() => getRecentEmojis(mx, limit));

  useEffect(() => {
    const handleAccountData = (event: MatrixEvent) => {
      if (event.getType() !== (CustomAccountDataEvent.ElementRecentEmoji as string)) return;
      setRecentEmoji(getRecentEmojis(mx, limit));
    };

    mx.on(ClientEvent.AccountData, handleAccountData);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleAccountData);
    };
  }, [mx, limit]);

  return recentEmoji;
};
