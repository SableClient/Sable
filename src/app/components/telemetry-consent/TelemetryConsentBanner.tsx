import { useEffect, useRef, useState } from 'react';
import { Box, Button, Icon, Icons, Text } from 'folds';
import * as css from './TelemetryConsentBanner.css';

const SENTRY_KEY = 'sable_sentry_enabled';

export function TelemetryConsentBanner() {
  const isSentryConfigured = Boolean(import.meta.env.VITE_SENTRY_DSN);
  const [visible, setVisible] = useState(
    isSentryConfigured && localStorage.getItem(SENTRY_KEY) === null
  );
  const [dismissing, setDismissing] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    },
    []
  );

  if (!visible) return null;

  const handleEnable = () => {
    localStorage.setItem(SENTRY_KEY, 'true');
    window.location.reload();
  };

  const handleDecline = () => {
    localStorage.setItem(SENTRY_KEY, 'false');
    setDismissing(true);
    dismissTimerRef.current = setTimeout(() => setVisible(false), 220);
  };

  return (
    <div className={css.Container}>
      <div
        className={css.Banner}
        data-dismissing={dismissing}
        role="region"
        aria-label="Crash reporting prompt"
      >
        <div className={css.Header}>
          <Icon src={Icons.Shield} size="400" />
          <div className={css.HeaderText}>
            <Text size="H4">Help improve Sable</Text>
            <Text size="T300" priority="300">
              Optionally send anonymous crash reports to help us fix bugs faster. No messages, room
              names, or personal data are included.{' '}
              <a
                href="https://github.com/SableClient/Sable/blob/dev/docs/PRIVACY.md"
                target="_blank"
                rel="noreferrer noopener"
              >
                Learn more
              </a>
            </Text>
          </div>
        </div>
        <Box className={css.Actions}>
          <Button variant="Secondary" fill="Soft" size="300" radii="300" onClick={handleDecline}>
            <Text size="B300">No thanks</Text>
          </Button>
          <Button variant="Primary" fill="Solid" size="300" radii="300" onClick={handleEnable}>
            <Text size="B300">Enable</Text>
          </Button>
        </Box>
      </div>
    </div>
  );
}
