import { useState } from 'react';
import { Box, Text, Switch } from 'folds';
import * as Sentry from '@sentry/react';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { SequenceCardStyle } from '$features/settings/styles.css';

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

  const isSentryConfigured = Sentry.isInitialized();
  const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE;

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
          <SettingTile
            title="Enable Session Replay"
            description={`Record sessions for debugging errors. All text, media, and inputs are FULLY MASKED for privacy. ${environment === 'development' || environment === 'preview' ? 'Records 100% of sessions in dev/preview.' : 'Records 10% of sessions in production, 100% on errors.'}`}
            after={
              <Switch
                variant="Primary"
                value={sessionReplayEnabled}
                onChange={handleReplayToggle}
              />
            }
          />
        )}
      </SequenceCard>
      {isSentryConfigured && (
        <Box direction="Column" gap="100">
          <Text size="T200" style={{ opacity: 0.7 }}>
            All data sent to Sentry is filtered for sensitive information like passwords and access
            tokens. You can opt out at any time.
          </Text>
          <Text size="T200" style={{ opacity: 0.7 }}>
            <strong>Session Replay Privacy:</strong> When enabled, all text content, media
            (images/video/audio), and form inputs are completely masked or blocked. Only UI
            structure and interactions are recorded.
          </Text>
        </Box>
      )}
    </Box>
  );
}
