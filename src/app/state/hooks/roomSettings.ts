import { useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { RoomSettingsPage, RoomSettingsState } from '$state/roomSettings';
import { roomSettingsAtom } from '$state/roomSettings';

export const useRoomSettingsState = (): RoomSettingsState | undefined => {
  const data = useAtomValue(roomSettingsAtom);

  return data;
};

type CloseCallback = () => void;
export const useCloseRoomSettings = (): CloseCallback => {
  const setSettings = useSetAtom(roomSettingsAtom);

  const close: CloseCallback = useCallback(() => {
    setSettings(undefined);
  }, [setSettings]);

  return close;
};

type OpenCallback = (roomId: string, space?: string, page?: RoomSettingsPage) => void;
export const useOpenRoomSettings = (): OpenCallback => {
  const setSettings = useSetAtom(roomSettingsAtom);

  const open: OpenCallback = useCallback(
    (roomId, spaceId, page) => {
      setSettings({ roomId, spaceId, page });
    },
    [setSettings]
  );

  return open;
};
