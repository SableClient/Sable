import { Box, Button, Text, config, toRem } from 'folds';

import { ThemeThirdPartyBanner } from './ThemeThirdPartyBanner';

export type SableChatPreviewPlaceholderProps = {
  kind: 'theme' | 'tweak';
  url: string;
  hostLabel: string;
  isApprovedHost: boolean;
  onLoadPreview: () => void;
};

export function SableChatPreviewPlaceholder({
  kind,
  url,
  hostLabel,
  isApprovedHost,
  onLoadPreview,
}: SableChatPreviewPlaceholderProps) {
  const title = kind === 'theme' ? 'Theme preview' : 'Tweak preview';
  const bodyApproved =
    kind === 'theme'
      ? 'This message links to a catalog theme preview. Nothing is fetched until you load it.'
      : 'This message links to a catalog tweak. Nothing is fetched until you load it.';
  const bodyThirdParty =
    kind === 'theme'
      ? 'This message links to third-party theme CSS. Nothing is fetched until you confirm. Only load previews you trust.'
      : 'This message links to third-party tweak CSS. Nothing is fetched until you confirm. Only load previews you trust.';

  return (
    <Box
      direction="Column"
      gap="300"
      style={{
        width: '400px',
        maxWidth: '100%',
        flexShrink: 0,
        boxSizing: 'border-box',
        padding: toRem(12),
        borderRadius: config.radii.R300,
        border: `${toRem(1)} solid var(--sable-surface-container-line)`,
        background: 'var(--sable-surface-container)',
      }}
    >
      <Box direction="Column" gap="100" style={{ minWidth: 0 }}>
        <Text size="H6">{title}</Text>
        {!isApprovedHost ? <ThemeThirdPartyBanner kind={kind} hostLabel={hostLabel} /> : null}
        <Text size="T200" priority="300" style={{ wordBreak: 'break-word' }}>
          {isApprovedHost ? bodyApproved : bodyThirdParty}
        </Text>
        <Text size="T200" priority="300">
          {isApprovedHost ? 'Official catalog' : hostLabel}
        </Text>
        <Text
          size="T200"
          priority="300"
          style={{
            wordBreak: 'break-all',
            fontFamily: 'monospace',
            opacity: 0.85,
          }}
        >
          {url}
        </Text>
      </Box>
      <Button variant="Primary" fill="Soft" outlined size="300" radii="300" onClick={onLoadPreview}>
        <Text size="B300">Load preview</Text>
      </Button>
    </Box>
  );
}
