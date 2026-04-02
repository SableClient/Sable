import { useCallback, useEffect, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  config,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
} from 'folds';

import { stopPropagation } from '$utils/keyboard';

type ThemeCatalogOnboardingProps = {
  open: boolean;
  onEnable: () => void;
  onDecline: () => void;
};

export function ThemeCatalogOnboarding({ open, onEnable, onDecline }: ThemeCatalogOnboardingProps) {
  return (
    <Overlay open={open} backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onDecline,
            clickOutsideDeactivates: false,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface">
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Remote themes</Text>
              </Box>
              <IconButton size="300" radii="300" onClick={onDecline} aria-label="Close">
                <Icon src={Icons.Cross} size="100" />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              <Text priority="400">
                Load themes from the official Sable theme catalog on GitHub? You can browse
                previews, save favorites locally, and sync them with light and dark mode. If you
                choose not to, you can keep using the built-in Light and Dark themes only.
              </Text>
              <Box direction="Column" gap="200">
                <Button variant="Primary" fill="Solid" onClick={onEnable}>
                  <Text size="B400">Yes, use the catalog</Text>
                </Button>
                <Button variant="Secondary" fill="Soft" onClick={onDecline}>
                  <Text size="B400">No, built-in themes only</Text>
                </Button>
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

export function useThemeCatalogOnboardingGate(
  onboardingDone: boolean,
  onComplete: (enabled: boolean) => void
) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!onboardingDone) {
      setOpen(true);
    }
  }, [onboardingDone]);

  const handleEnable = useCallback(() => {
    setOpen(false);
    onComplete(true);
  }, [onComplete]);

  const handleDecline = useCallback(() => {
    setOpen(false);
    onComplete(false);
  }, [onComplete]);

  return {
    open,
    dialog: (
      <ThemeCatalogOnboarding open={open} onEnable={handleEnable} onDecline={handleDecline} />
    ),
  };
}
