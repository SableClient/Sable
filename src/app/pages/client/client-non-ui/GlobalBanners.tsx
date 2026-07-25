import { NotificationBanner } from '$components/notification-banner';
import { ThemeMigrationBanner } from '$components/theme/ThemeMigrationBanner';
import { TelemetryConsentBanner } from '$components/telemetry-consent';
import { UnverifiedNoticeBanner } from '$components/unverified-notice';
import { GlobalBannerRenderer } from '$components/global-banner/GlobalBannerRenderer';

export function GlobalBanners() {
  return (
    <>
      <NotificationBanner />
      <TelemetryConsentBanner />
      <UnverifiedNoticeBanner />
      <GlobalBannerRenderer />
      <ThemeMigrationBanner />
    </>
  );
}
