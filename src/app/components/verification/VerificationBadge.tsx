import { ShieldCheckIcon, XCircleIcon } from '@phosphor-icons/react';
import { Box, Tooltip, TooltipProvider, Text } from 'folds';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserVerification } from '$hooks/useUserVerificationStatus';

type VerificationBadgeProps = {
  status: UserVerification;
  size?: number;
};

/**
 * Renders a green checkmark icon for verified users,
 * a warning icon for previously-verified users,
 * or a red cross for unverified users.
 */
export function VerificationBadge({ status, size = 16 }: VerificationBadgeProps): ReactNode {
  const { t } = useTranslation();

  const color =
    status === 'verified'
      ? '#00a83e'
      : status === 'warning'
        ? '#f0c000'
        : status === 'normal'
          ? '#e03e3e'
          : 'transparent';

  const label =
    status === 'verified'
      ? t('verification.user_verified')
      : status === 'warning'
        ? t('verification.user_previously_verified')
        : status === 'normal'
          ? t('verification.user_not_verified')
          : '';

  const Icon = status === 'verified' || status === 'warning' ? ShieldCheckIcon : XCircleIcon;

  const iconElement = (
    <Icon
      weight="fill"
      size={size}
      style={{ color: color === 'transparent' ? 'transparent' : color, lineHeight: 0 }}
    />
  );

  if (color === 'transparent') {
    return iconElement;
  }

  return (
    <TooltipProvider position="Top" tooltip={<Tooltip><Text size="T200">{label}</Text></Tooltip>}>
      {(triggerRef) => (
        <Box
          ref={triggerRef}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: 4,
            flexShrink: 0,
          }}
        >
          {iconElement}
        </Box>
      )}
    </TooltipProvider>
  );
}
