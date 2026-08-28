import { createPortal } from 'react-dom';
import { Box, Text, color, config, toRem } from 'folds';

import { Check, sizedIcon } from '$components/icons/phosphor';
import { useToastMessage } from '$state/toast';
import { OVERLAY_LAYER_TOP } from '$components/overlay-stack';

type ToastProps = {
  container: HTMLElement | null;
};

export function Toast({ container }: ToastProps) {
  const toast = useToastMessage();
  if (!toast || !container) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: `calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + ${toRem(24)})`,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: OVERLAY_LAYER_TOP,
      }}
    >
      <Box
        as="div"
        shrink="No"
        alignItems="Center"
        gap="200"
        style={{
          padding: `${config.space.S200} ${config.space.S400}`,
          backgroundColor: color.Success.Container,
          color: color.Success.OnContainer,
          borderRadius: config.radii.Pill,
          boxShadow: config.shadow.E200,
          maxWidth: '90%',
        }}
      >
        {sizedIcon(Check, '200')}
        <Text size="T300" truncate>
          {toast.text}
        </Text>
      </Box>
    </div>,
    container
  );
}
