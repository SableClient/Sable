import { useNavigate } from 'react-router-dom';
import { FormPage } from '$components/page/FormPage';
import { BugReportForm } from '$features/bug-report';

export function BugReportPage() {
  const navigate = useNavigate();
  const navigateBack = () => navigate(-1);

  return (
    <FormPage
      title="Report an Issue"
      subTitle="Report a bug or request a feature."
      closeLabel="Close bug report"
      onClose={navigateBack}
    >
      <BugReportForm onDone={navigateBack} />
    </FormPage>
  );
}
