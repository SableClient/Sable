import { useMemo, useState } from 'react';
import { Text } from 'folds';
import { Shield } from '$components/icons/phosphor';
import { useRegisterGlobalBanner, type GlobalBanner } from '$state/globalBanners';

const SENTRY_KEY = 'sable_sentry_enabled';

export function TelemetryConsentBanner() {
  const isSentryConfigured = Boolean(import.meta.env.VITE_SENTRY_DSN);
  const [visible, setVisible] = useState(
    isSentryConfigured && localStorage.getItem(SENTRY_KEY) === null
  );

  const handleEnable = () => {
    localStorage.setItem(SENTRY_KEY, 'true');
    window.location.reload();
  };

  const handleDecline = () => {
    localStorage.setItem(SENTRY_KEY, 'false');
    setVisible(false);
  };

  const bannerData = useMemo<GlobalBanner | null>(() => {
    if (!visible) return null;
    return {
      id: 'telemetry-consent',
      priority: 100, // Higher priority than device verification
      icon: Shield,
      title: 'Help improve Sable',
      description: (
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
      ),
      primaryAction: {
        label: 'Enable',
        variant: 'Primary',
        onClick: handleEnable,
      },
      secondaryAction: {
        label: 'No thanks',
        variant: 'Secondary',
        onClick: handleDecline,
      },
    };
  }, [visible]);

  useRegisterGlobalBanner(bannerData);

  return null;
}
