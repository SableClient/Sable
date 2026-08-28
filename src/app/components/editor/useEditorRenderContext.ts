import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { mxcUrlToHttp } from '$utils/matrix';
import { nicknamesAtom } from '$state/nicknames';
import type { EditorRenderContext } from './prosemirrorNodeViews';
import { formatMentionElementDisplayName } from './utils';

export const useEditorRenderContext = (): EditorRenderContext => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const nicknames = useAtomValue(nicknamesAtom);

  return useMemo(
    () => ({
      emoticonSrc: (key) => mxcUrlToHttp(mx, key, useAuthentication) ?? undefined,
      mentionDisplayName: (token) => {
        const nickname = nicknames[token.id];
        return nickname ? `@${nickname}` : formatMentionElementDisplayName(token);
      },
    }),
    [mx, nicknames, useAuthentication]
  );
};
