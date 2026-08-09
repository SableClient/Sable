import { createContext, useCallback, useContext, useState, useSyncExternalStore } from 'react';
import { useElementSizeObserver } from './useElementSizeObserver';

const TABLET_BREAKPOINT = 1124;
export const MOBILE_BREAKPOINT = 750;

export enum ScreenSize {
  Desktop = 'Desktop',
  Tablet = 'Tablet',
  Mobile = 'Mobile',
}

const getScreenSize = (width: number): ScreenSize => {
  if (width > TABLET_BREAKPOINT) return ScreenSize.Desktop;
  if (width > MOBILE_BREAKPOINT) return ScreenSize.Tablet;
  return ScreenSize.Mobile;
};

export const useScreenSize = (): ScreenSize => {
  const [size, setSize] = useState(getScreenSize(document.body.clientWidth));

  useElementSizeObserver(
    useCallback(() => document.body, []),
    useCallback((width) => setSize(getScreenSize(width)), [])
  );

  return size;
};

const ScreenSizeContext = createContext<ScreenSize | null>(null);

/** Null outside a provider, for shared components that must not throw there. */
export const useScreenSizeOptionally = (): ScreenSize | null => useContext(ScreenSizeContext);
export const ScreenSizeProvider = ScreenSizeContext.Provider;

export const useScreenSizeContext = (): ScreenSize => {
  const screenSize = useContext(ScreenSizeContext);
  if (screenSize === null) {
    throw new Error('Screen size not provided!');
  }
  return screenSize;
};

const coarsePointerQuery = () => globalThis.matchMedia?.('(pointer: coarse)');

const subscribeCoarsePointer = (onChange: () => void) => {
  const query = coarsePointerQuery();
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
};

const getCoarsePointer = () => coarsePointerQuery()?.matches ?? false;

/** Mobile, or tablet width with a touch pointer — not a narrow desktop window. */
export const useCompactLayout = (): boolean => {
  const screenSize = useContext(ScreenSizeContext);
  const coarsePointer = useSyncExternalStore(
    subscribeCoarsePointer,
    getCoarsePointer,
    getCoarsePointer
  );

  if (screenSize === ScreenSize.Mobile) return true;
  return screenSize === ScreenSize.Tablet && coarsePointer;
};
