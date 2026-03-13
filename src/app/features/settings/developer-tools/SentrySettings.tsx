import { useState } from 'react';
import { Box, Text, Button, Switch } from 'folds';
import * as Sentry from '@sentry/react';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { getDebugLogger } from '$utils/debugLogger';

export function SentrySettings() {
  const [sentryEnabled, setSentryEnabled] = useState(
    localStorage.getItem('sable_sentry_enabled') !== 'false'
  );
  const [sessionReplayEnabled, setSessionReplayEnabled] = useState(
    localStorage.getItem('sable_sentry_replay_enabled') !== 'false'
  );
  const [needsRefresh, setNeedsRefresh] = useState(false);

  const handleSentryToggle = (enabled: boolean) => {
    setSentryEnabled(enabled);
    if (enabled) {
      localStorage.removeItem('sable_sentry_enabled');
    } else {
      localStorage.setItem('sable_sentry_enabled', 'false');
    }
    setNeedsRefresh(true);
  };

  const handleReplayToggle = (enabled: boolean) => {
    setSessionReplayEnabled(enabled);
    if (enabled) {
      localStorage.removeItem('sable_sentry_replay_enabled');
    } else {
      localStorage.setItem('sable_sentry_replay_enabled', 'false');
    }
    setNeedsRefresh(true);
  };

  const handleTestError = () => {
    // eslint-disable-next-line no-console
    console.log('[Sentry Test] Sending test error...');
    try {
      throw new Error('Test error from Sentry Settings');
    } catch (error) {
      const eventId = Sentry.captureException(error, {
        tags: {
          source: 'sentry-settings-test',
        },
      });
      // eslint-disable-next-line no-console
      console.log('[Sentry Test] Error captured with eventId:', eventId);
      // eslint-disable-next-line no-alert
      window.alert(`Test error sent to Sentry!\nEvent ID: ${eventId || 'none'}`);
    }
  };

  const handleSendFeedback = () => {
    // eslint-disable-next-line no-console
    console.log('[Sentry Test] Attaching logs and sending feedback...');
    const debugLogger = getDebugLogger();
    debugLogger.attachLogsToSentry(50);

    const eventId = Sentry.captureMessage('Test feedback from settings', {
      level: 'info',
      tags: {
        source: 'sentry-settings-test',
      },
    });

    // eslint-disable-next-line no-console
    console.log('[Sentry Test] Message captured with eventId:', eventId);

    if (eventId) {
      const feedbackId = Sentry.captureFeedback({
        message: 'This is a test feedback message from the Sentry Settings panel.',
        name: 'Test User',
        email: 'test@sable.chat',
        associatedEventId: eventId,
      });
      // eslint-disable-next-line no-console
      console.log('[Sentry Test] Feedback captured with ID:', feedbackId);
      // eslint-disable-next-line no-alert
      window.alert(`Test feedback sent to Sentry!\nEvent ID: ${eventId}\nFeedback ID: ${feedbackId || 'none'}`);
    } else {
      // eslint-disable-next-line no-alert
      window.alert('Failed to send test feedback - no event ID returned');
    }
  };

  const handleAttachLogs = () => {
    const debugLogger = getDebugLogger();
    debugLogger.attachLogsToSentry(100);
    // eslint-disable-next-line no-alert
    window.alert(
      'Recent logs attached to Sentry context. They will be included in the next error report.'
    );
  };

  const handleShowDiagnostics = () => {
    const dsn = import.meta.env.VITE_SENTRY_DSN;
    const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE;
    const release = import.meta.env.VITE_APP_VERSION;
    
    const info = [
      `DSN: ${dsn ? `${dsn.substring(0, 30)}...` : 'NOT SET'}`,
      `Environment: ${environment}`,
      `Release: ${release || 'not set'}`,
      `Sentry Enabled (localStorage): ${sentryEnabled}`,
      `Session Replay Enabled: ${sessionReplayEnabled}`,
      `Sentry SDK Available: ${typeof Sentry !== 'undefined'}`,
      ``,
      `To test from console, run:`,
      `Sentry.captureMessage('Test message', 'info')`,
    ].join('\n');

    // eslint-disable-next-line no-console
    console.log('[Sentry Diagnostics]\n' + info);
    // eslint-disable-next-line no-alert
    window.alert(info);
  };

  const isSentryConfigured = Boolean(import.meta.env.VITE_SENTRY_DSN);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Error Tracking (Sentry)</Text>
      {needsRefresh && (
        <Box
          style={{
            padding: '12px',
            backgroundColor: 'rgba(33, 150, 243, 0.1)',
            borderRadius: '8px',
          }}
        >
          <Text size="T300" style={{ color: 'rgb(33, 150, 243)' }}>
            Please refresh the page for Sentry settings to take effect.
          </Text>
        </Box>
      )}
      {!isSentryConfigured && (
        <Box
          style={{
            padding: '12px',
            backgroundColor: 'rgba(255, 193, 7, 0.1)',
            borderRadius: '8px',
          }}
        >
          <Text size="T300" style={{ color: 'orange' }}>
            Sentry is not configured. Set VITE_SENTRY_DSN to enable error tracking.
          </Text>
        </Box>
      )}
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Enable Sentry Error Tracking"
          description={
            isSentryConfigured
              ? 'Send anonymous error reports to help improve Sable. No personal data is sent.'
              : 'Error tracking is not configured for this instance.'
          }
          after={
            <Switch
              variant="Primary"
              value={sentryEnabled}
              onChange={handleSentryToggle}
              disabled={!isSentryConfigured}
            />
          }
        />
        {sentryEnabled && isSentryConfigured && (
          <>
            <SettingTile
              title="Enable Session Replay"
              description="Record sessions for debugging errors. All text, media, and inputs are masked for privacy."
              after={
                <Switch
                  variant="Primary"
                  value={sessionReplayEnabled}
                  onChange={handleReplayToggle}
                />
              }
            />
            <SettingTile
              title="Test Error Reporting"
              description="Send a test error to Sentry to verify configuration."
              after={
                <Button
                  onClick={handleTestError}
                  variant="Secondary"
                  fill="Soft"
                  size="300"
                  radii="300"
                  outlined
                >
                  <Text size="B300">Send Test Error</Text>
                </Button>
              }
            />
            <SettingTile
              title="Test Feedback"
              description="Send a test feedback message with recent logs."
              after={
                <Button
                  onClick={handleSendFeedback}
                  variant="Secondary"
                  fill="Soft"
                  size="300"
                  radii="300"
                  outlined
                >
                  <Text size="B300">Send Test Feedback</Text>
                </Button>
              }
            />
            <SettingTile
              title="Attach Debug Logs"
              description="Attach recent debug logs to next error report for more context."
              after={
                <Button
                  onClick={handleAttachLogs}
                  variant="Secondary"
                  fill="Soft"
                  size="300"
                  radii="300"
                  outlined
                >
                  <Text size="B300">Attach Logs</Text>
                </Button>
              }
            />
            <SettingTile
              title="Show Diagnostics"
              description="Display current Sentry configuration and debug information."
              after={
                <Button
                  onClick={handleShowDiagnostics}
                  variant="Secondary"
                  fill="Soft"
                  size="300"
                  radii="300"
                  outlined
                >
                  <Text size="B300">Show Config</Text>
                </Button>
              }
            />
          </>
        )}
      </SequenceCard>
      {isSentryConfigured && (
        <Text size="T200" style={{ opacity: 0.7 }}>
          All data sent to Sentry is filtered for sensitive information like passwords and access
          tokens. You can opt out at any time.
        </Text>
      )}
    </Box>
  );
}
