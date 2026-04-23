import { useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { SpaceSettingsPage, SpaceSettingsState } from '$state/spaceSettings';
import { spaceSettingsAtom } from '$state/spaceSettings';

export const useSpaceSettingsState = (): SpaceSettingsState | undefined => {
  const data = useAtomValue(spaceSettingsAtom);

  return data;
};

type CloseCallback = () => void;
export const useCloseSpaceSettings = (): CloseCallback => {
  const setSettings = useSetAtom(spaceSettingsAtom);

  const close: CloseCallback = useCallback(() => {
    setSettings(undefined);
  }, [setSettings]);

  return close;
};

type OpenCallback = (roomId: string, space?: string, page?: SpaceSettingsPage) => void;
export const useOpenSpaceSettings = (): OpenCallback => {
  const setSettings = useSetAtom(spaceSettingsAtom);

  const open: OpenCallback = useCallback(
    (roomId, spaceId, page) => {
      setSettings({ roomId, spaceId, page });
    },
    [setSettings]
  );

  return open;
};
