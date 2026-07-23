import { Box, Text, config } from 'folds';
import { Lock } from '$components/icons/phosphor';
import { useTranslation } from 'react-i18next';
import { getMxIdLocalPart } from '$utils/matrix';

type MKeyVerificationRequestProps = {
  sender: string;
  senderLocalpart: string;
  isSelf: boolean;
};

export function MKeyVerificationRequest({
  sender,
  senderLocalpart,
  isSelf,
}: MKeyVerificationRequestProps) {
  const { t } = useTranslation();

  const s = config.space;
  const r = config.radii;

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: s.S200,
    padding: `${s.S200} ${s.S300}`,
    borderRadius: r.R300,
    backgroundColor: 'var(--folds-color-surface-variant-container)',
  };

  const textStyle: React.CSSProperties = {
    color: 'var(--folds-color-surface-variant-on-container)',
    fontSize: 'inherit',
  };

  return (
    <Box style={containerStyle}>
      <Lock size={16} style={{ color: 'var(--folds-color-surface-variant-on-container)' }} />
      <Box direction="Column" gap="100">
        <Text size="T300" priority="300">
          {isSelf
            ? t('verification.verify_you_started')
            : t('verification.verify_user_wants_to_verify', { name: senderLocalpart })}
        </Text>
        <Text size="T200" priority="300" style={textStyle}>
          {senderLocalpart} ({sender})
        </Text>
      </Box>
    </Box>
  );
}
