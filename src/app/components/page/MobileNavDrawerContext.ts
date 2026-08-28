import { createContext, useContext } from 'react';

export type MobileSwipeEnd = {
  distanceX: number;
  velocityX: number;
};

export type MobileSwipeTarget = {
  move: (distanceX: number) => void;
  end: (gesture: MobileSwipeEnd) => void;
  cancel: () => void;
};

export type MobileNavDrawerControls = {
  openContent: (path: string) => void;
  registerChatSwipe: (element: HTMLElement, target: MobileSwipeTarget) => () => void;
  registerMessageSwipe: (element: HTMLElement, target: MobileSwipeTarget) => () => void;
};

export const MobileNavDrawerContext = createContext<MobileNavDrawerControls | undefined>(undefined);

export function useMobileNavDrawer(): MobileNavDrawerControls | undefined {
  return useContext(MobileNavDrawerContext);
}

export function useOpenMobileDrawerContent(): ((path: string) => void) | undefined {
  return useMobileNavDrawer()?.openContent;
}
