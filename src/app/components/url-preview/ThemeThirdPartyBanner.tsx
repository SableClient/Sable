import { Box, Icon, Icons, Text, toRem, config } from 'folds';

type ThemeThirdPartyBannerProps = {
  hostLabel: string;
};

export function ThemeThirdPartyBanner({ hostLabel }: ThemeThirdPartyBannerProps) {
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
            Third-party theme
          </Text>
          <Text size="T200" priority="300" style={{ wordBreak: 'break-word' }}>
            This preview is hosted on {hostLabel}, outside the Sable catalog allowlist. Saving or
            applying installs full theme CSS from that host—only use themes you trust.
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
