import { RouteSurface } from '$components/page/RouteSurface';
import { BugReportForm } from '$features/bug-report';
import { useCloseShallowRoute } from '$pages/client/useShallowRoute';

export function BugReportPage() {
  const close = useCloseShallowRoute();

  return (
    <RouteSurface
      title="Report an Issue"
      subTitle="Report a bug or request a feature."
      closeLabel="Close bug report"
    >
      <BugReportForm onDone={close} />
    </RouteSurface>
  );
}
