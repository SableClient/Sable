import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import type { CreateSpaceModalState } from '$state/createSpaceModal';
import { createSpaceModalAtom } from '$state/createSpaceModal';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { getCreateSpacePath } from '$pages/pathUtils';

export const useCreateSpaceModalState = (): CreateSpaceModalState | undefined => {
  const data = useAtomValue(createSpaceModalAtom);

  return data;
};

type CloseCallback = () => void;
export const useCloseCreateSpaceModal = (): CloseCallback => {
  const setSettings = useSetAtom(createSpaceModalAtom);

  const close: CloseCallback = useCallback(() => {
    setSettings(undefined);
  }, [setSettings]);

  return close;
};

type OpenCallback = (spaceId?: string) => void;
export const useOpenCreateSpaceModal = (): OpenCallback => {
  const setSettings = useSetAtom(createSpaceModalAtom);
  const navigate = useNavigate();
  const isMobile = useScreenSizeContext() === ScreenSize.Mobile;

  const open: OpenCallback = useCallback(
    (spaceId) => {
      if (isMobile) {
        navigate(getCreateSpacePath(spaceId));
        return;
      }
      setSettings({ spaceId });
    },
    [setSettings, isMobile, navigate]
  );

  return open;
};
