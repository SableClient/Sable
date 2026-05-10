import { lazy, Suspense } from 'react';
import { useBugReportModalOpen } from '$state/hooks/bugReportModal';

const BugReportModal = lazy(async () => {
  const mod = await import('./BugReportModal');
  return { default: mod.BugReportModal };
});

export function BugReportModalRenderer() {
  const open = useBugReportModalOpen();

  if (!open) return null;

  return (
    <Suspense fallback={null}>
      <BugReportModal />
    </Suspense>
  );
}
