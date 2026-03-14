import { Box, Button, Dialog, Icon, Icons, Text, color, config } from 'folds';
import * as Sentry from '@sentry/react';
import { SplashScreen } from '$components/splash-screen';
import { buildGitHubUrl } from '$features/bug-report/BugReportModal';

type ErrorPageProps = {
  error: Error;
  /** Sentry event ID — present when Sentry.ErrorBoundary captured the crash */
  eventId?: string;
};

function createIssueUrl(error: Error): string {
  const stacktrace = error.stack || 'No stacktrace available';

  const automatedBugReport = `# Automated Bug Report
Error occurred in the application.

## Error Message
\`\`\`
${error.message}
\`\`\`

## Stacktrace
\`\`\`
${stacktrace}
\`\`\``;

  return buildGitHubUrl('bug', `Error: ${error.message}`, { context: automatedBugReport });
}

// This component is used as the fallback for the ErrorBoundary in App.tsx, which means it will be rendered whenever an uncaught error is thrown in any of the child components and not handled locally.
// It provides a user-friendly error message and options to report the issue or reload the page.
// Motivation of the design is to encourage users to report issues while also providing them with the necessary information to do so, and to give them an easy way to recover by reloading the page.
// Note: Since this component is rendered in response to an error, it should be as resilient as possible and avoid any complex logic or dependencies that could potentially throw additional errors.
export function ErrorPage({ error, eventId }: ErrorPageProps) {
  const sentryEnabled = Sentry.isInitialized();
  const reportedToSentry = sentryEnabled && !!eventId;
  return (
    <SplashScreen>
      <Box grow="Yes" direction="Column" gap="400" alignItems="Center" justifyContent="Center">
        <Dialog
          style={{
            maxWidth: '600px',
            minWidth: '300px',
            padding: config.space.S400,
          }}
        >
          <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
            <Box direction="Column" gap="100">
              <Box alignItems="Center" gap="200">
                <Icon
                  size="300"
                  src={Icons.Warning}
                  filled
                  style={{ color: color.Critical.Main }}
                />
                <Text size="H2">Oops! Something went wrong</Text>
              </Box>
              <Text size="T300">
                {reportedToSentry
                  ? 'An unexpected error occurred. This crash has been automatically reported to our team. You can add more details to help us investigate.'
                  : 'An unexpected error occurred. Please try again. If it continues, report the issue on our GitHub using the button below, it will include error details to help us investigate. Thank you for helping improve the app.'}
              </Text>
              {reportedToSentry ? (
                <Box direction="Column" gap="200">
                  <Button
                    variant="Primary"
                    onClick={() => Sentry.showReportDialog({ eventId })}
                    fill="Solid"
                    title="Opens a short form so you can describe what you were doing before the crash. This helps our team fix the issue faster."
                  >
                    <Text as="span" size="B400">
                      Add Details to Report
                    </Text>
                  </Button>
                  <Button
                    variant="Secondary"
                    onClick={() => window.open(createIssueUrl(error), '_blank', 'noopener noreferrer')}
                    fill="None"
                    title="Opens a pre-filled GitHub issue as an alternative reporting method."
                  >
                    <Text as="span" size="B400">
                      Also Report on GitHub
                    </Text>
                  </Button>
                </Box>
              ) : (
                <Button
                  variant="Secondary"
                  onClick={() => window.open(createIssueUrl(error), '_blank', 'noopener noreferrer')}
                  fill="Solid"
                  title="Clicking this button will open a new issue on our GitHub repository with the error details pre-filled. Please review the information before submitting."
                >
                  <Text as="span" size="B400">
                    Report Issue
                  </Text>
                </Button>
              )}
              <Box
                direction="Column"
                gap="300"
                style={{
                  padding: config.space.S300,
                  backgroundColor: color.Surface.Container,
                  borderRadius: config.radii.R300,
                }}
              >
                <Text size="T300" style={{ color: color.Critical.Main }}>
                  {error.message}
                </Text>
                <Box
                  style={{
                    padding: config.space.S200,
                    backgroundColor: color.Surface.Container,
                    borderRadius: config.radii.R300,
                    overflow: 'auto',
                    maxHeight: '200px',
                    minHeight: '100px',
                  }}
                >
                  <Text
                    as="pre"
                    size="T200"
                    style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                  >
                    {error.stack}
                  </Text>
                </Box>
              </Box>
            </Box>
            <Button
              variant="Primary"
              onClick={() => window.location.reload()}
              fill="Solid"
              title="clicking this will reload the page and hopefully lead to a functioning app again :)"
            >
              <Text as="span" size="B400">
                Reload Page
              </Text>
            </Button>
          </Box>
        </Dialog>
      </Box>
    </SplashScreen>
  );
}
