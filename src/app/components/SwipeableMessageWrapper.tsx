import { lazy, Suspense, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { mobileOrTablet } from '$utils/user-agent';
import { RightSwipeAction, settingsAtom } from '$state/settings';

const SwipeableMessageWrapperActive = lazy(async () => {
  const mod = await import('./SwipeableMessageWrapperActive');
  return { default: mod.SwipeableMessageWrapperActive };
});

export function SwipeableMessageWrapper({
  children,
  onReply,
}: {
  children: ReactNode;
  onReply: () => void;
}) {
  const settings = useAtomValue(settingsAtom);

  const isSwipeToReplyEnabled =
    settings.mobileGestures &&
    mobileOrTablet() &&
    settings.rightSwipeAction !== RightSwipeAction.Members;

  if (!isSwipeToReplyEnabled) {
    return children;
  }

  return (
    <Suspense fallback={children}>
      <SwipeableMessageWrapperActive onReply={onReply}>{children}</SwipeableMessageWrapperActive>
    </Suspense>
  );
}
