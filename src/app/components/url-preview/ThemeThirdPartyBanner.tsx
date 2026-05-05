import { Box, Icon, Icons, Text, toRem, config } from 'folds';

type ThemeThirdPartyBannerProps = {
  hostLabel: string;
  /** Default `theme` for backward compatibility. */
  kind?: 'theme' | 'tweak';
};

export function ThemeThirdPartyBanner({ hostLabel, kind = 'theme' }: ThemeThirdPartyBannerProps) {
  const title = kind === 'tweak' ? 'Third-party tweak' : 'Third-party theme';
  const body =
    kind === 'tweak'
      ? `This tweak is hosted on ${hostLabel}, outside the Sable catalog allowlist. Saving or enabling applies CSS from that host. Only use tweaks from providers you trust.`
      : `This preview is hosted on ${hostLabel}, outside the Sable catalog allowlist. Saving or applying installs full theme CSS from that host. Only use themes from providers you trust.`;

  return (
    <Box
      direction="Column"
      gap="200"
      style={{
        padding: toRem(10),
        borderRadius: config.radii.R300,
        background: 'var(--sable-warn-container)',
        border: `${toRem(1)} solid var(--sable-warn-container-line)`,
        color: 'var(--sable-warn-on-container)',
      }}
    >
      <Box direction="Row" gap="200" alignItems="Start">
        <Icon src={Icons.Warning} size="100" filled />
        <Box direction="Column" gap="100" grow="Yes" style={{ minWidth: 0 }}>
          <Text size="T300" style={{ fontWeight: 600 }}>
            {title}
          </Text>
          <Text size="T200" priority="300" style={{ wordBreak: 'break-word' }}>
            {body}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
