import { useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { bugReportOpenAtom } from '$state/bugReportModal';

export const useBugReportModalOpen = (): boolean => useAtomValue(bugReportOpenAtom);

export const useOpenBugReportModal = (): (() => void) => {
  const setOpen = useSetAtom(bugReportOpenAtom);
  return useCallback(() => setOpen(true), [setOpen]);
};

export const useCloseBugReportModal = (): (() => void) => {
  const setOpen = useSetAtom(bugReportOpenAtom);
  return useCallback(() => setOpen(false), [setOpen]);
};
