import { lazy, Suspense, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { settingsAtom } from '$state/settings';
import { mobileOrTablet } from '$utils/user-agent';

const SwipeableOverlayWrapperActive = lazy(async () => {
  const mod = await import('./SwipeableOverlayWrapperActive');
  return { default: mod.SwipeableOverlayWrapperActive };
});

interface SwipeableOverlayWrapperProps {
  children: ReactNode;
  onClose: () => void;
  direction: 'left' | 'right';
}

export function SwipeableOverlayWrapper({
  children,
  onClose,
  direction,
}: SwipeableOverlayWrapperProps) {
  const settings = useAtomValue(settingsAtom);

  const plainWrapper = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        height: '100%',
        width: '100%',
      }}
    >
      {children}
    </div>
  );

  if (!settings.mobileGestures || !mobileOrTablet()) {
    return plainWrapper;
  }

  return (
    <Suspense fallback={plainWrapper}>
      <SwipeableOverlayWrapperActive onClose={onClose} direction={direction}>
        {children}
      </SwipeableOverlayWrapperActive>
    </Suspense>
  );
}
