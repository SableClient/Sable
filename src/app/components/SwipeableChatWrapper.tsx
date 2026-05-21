import { lazy, Suspense, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { settingsAtom } from '$state/settings';
import { mobileOrTablet } from '$utils/user-agent';

const SwipeableChatWrapperActive = lazy(async () => {
  const mod = await import('./SwipeableChatWrapperActive');
  return { default: mod.SwipeableChatWrapperActive };
});

interface SwipeableChatWrapperProps {
  children: ReactNode;
  onOpenSidebar?: () => void;
  onOpenMembers?: () => void;
  onReply?: () => void;
}

export function SwipeableChatWrapper({
  children,
  onOpenSidebar,
  onOpenMembers,
  onReply,
}: SwipeableChatWrapperProps) {
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
      <SwipeableChatWrapperActive
        settings={settings}
        onOpenSidebar={onOpenSidebar}
        onOpenMembers={onOpenMembers}
        onReply={onReply}
      >
        {children}
      </SwipeableChatWrapperActive>
    </Suspense>
  );
}
