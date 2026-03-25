import { useState, useEffect } from 'react';
import { Box, Text, Switch, Button } from 'folds';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { getDebugLogger, LogCategory } from '$utils/debugLogger';

const ALL_CATEGORIES: LogCategory[] = [
  'sync',
  'network',
  'notification',
  'message',
  'call',
  'ui',
  'timeline',
  'error',
  'general',
];

export function SentrySettings() {
  const [categoryEnabled, setCategoryEnabled] = useState<Record<LogCategory, boolean>>(() => {
    const logger = getDebugLogger();
    return Object.fromEntries(
      ALL_CATEGORIES.map((c) => [c, logger.getBreadcrumbCategoryEnabled(c)])
    ) as Record<LogCategory, boolean>;
  });
  const [sentryStats, setSentryStats] = useState(() => getDebugLogger().getSentryStats());

  useEffect(() => {
    const interval = setInterval(() => {
      setSentryStats(getDebugLogger().getSentryStats());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCategoryToggle = (category: LogCategory, enabled: boolean) => {
    getDebugLogger().setBreadcrumbCategoryEnabled(category, enabled);
    setCategoryEnabled((prev) => ({ ...prev, [category]: enabled }));
  };

  const handleExportLogs = () => {
    const data = getDebugLogger().exportLogs();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sable-debug-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isSentryConfigured = Boolean(import.meta.env.VITE_SENTRY_DSN);
  const sentryEnabled = localStorage.getItem('sable_sentry_enabled') === 'true';
  const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE;
  const isProd = environment === 'production';
  const traceSampleRate = isProd ? '10%' : '100%';
  const replaySampleRate = isProd ? '10%' : '100%';

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Error Tracking (Sentry)</Text>
      <Text size="T200" style={{ opacity: 0.7 }}>
        Error reporting toggles are in <strong>Settings → General → Diagnostics & Privacy</strong>.
      </Text>
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

      {isSentryConfigured && sentryEnabled && (
        <>
          <Text size="L400">Performance Metrics</Text>
          <SequenceCard
            className={SequenceCardStyle}
            variant="SurfaceVariant"
            direction="Column"
            gap="400"
          >
            <SettingTile
              title="Traces &amp; Profiles"
              description={`Current environment: ${environment}. Sample rate: ${traceSampleRate}`}
            />
            <SettingTile
              title="Session Replay"
              description={`Session sample rate: ${replaySampleRate} · On-error rate: 100%`}
            />
            <SettingTile
              title="Session Error Budget"
              description="At most 50 error events are forwarded to Sentry per page load to prevent quota exhaustion."
            />
          </SequenceCard>

          <Text size="L400">Breadcrumb Categories</Text>
          <Text size="T200" style={{ opacity: 0.7 }}>
            Control which log categories are included as breadcrumbs in Sentry error reports.
            Disabling a category reduces noise without affecting error capture.
          </Text>
          <SequenceCard
            className={SequenceCardStyle}
            variant="SurfaceVariant"
            direction="Column"
            gap="400"
          >
            {ALL_CATEGORIES.map((cat) => (
              <SettingTile
                key={cat}
                title={cat.charAt(0).toUpperCase() + cat.slice(1)}
                after={
                  <Switch
                    variant="Primary"
                    value={categoryEnabled[cat]}
                    onChange={(v) => handleCategoryToggle(cat, v)}
                  />
                }
              />
            ))}
          </SequenceCard>

          <Text size="L400">Debug Logs</Text>
          <SequenceCard
            className={SequenceCardStyle}
            variant="SurfaceVariant"
            direction="Column"
            gap="400"
          >
            <SettingTile
              title="Session Activity"
              description={`Errors captured: ${sentryStats.errors} · Warnings captured: ${sentryStats.warnings} (updates every 5 s)`}
            />
            <SettingTile
              title="Export Debug Logs"
              description="Download the current in-memory debug log buffer as a JSON file for offline analysis."
              after={
                <Button variant="Secondary" size="300" onClick={handleExportLogs}>
                  Export JSON
                </Button>
              }
            />
          </SequenceCard>
        </>
      )}
    </Box>
  );
}
