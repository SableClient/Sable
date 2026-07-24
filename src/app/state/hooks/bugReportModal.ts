import { useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { bugReportOpenAtom } from '$state/bugReportModal';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { getBugReportPath } from '$pages/pathUtils';

export const useBugReportModalOpen = (): boolean => useAtomValue(bugReportOpenAtom);

export const useOpenBugReportModal = (): (() => void) => {
  const setOpen = useSetAtom(bugReportOpenAtom);
  const navigate = useNavigate();
  const isMobile = useScreenSizeContext() === ScreenSize.Mobile;
  return useCallback(() => {
    if (isMobile) {
      navigate(getBugReportPath());
      return;
    }
    setOpen(true);
  }, [setOpen, navigate, isMobile]);
};

export const useCloseBugReportModal = (): (() => void) => {
  const setOpen = useSetAtom(bugReportOpenAtom);
  return useCallback(() => setOpen(false), [setOpen]);
};
