import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Header,
  Icon,
  IconButton,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import type { Room } from '$types/matrix-sdk';

import { useIntegrationManager, buildIntegrationManagerUrl } from '$hooks/useIntegrationManager';
import * as css from './IntegrationManager.css';

interface IntegrationManagerProps {
  room: Room;
  open: boolean;
  onClose: () => void;
}

export function IntegrationManager({ room, open, onClose }: IntegrationManagerProps) {
  const { managers, scalarToken, loading, error } = useIntegrationManager();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const manager = managers[0];

  const iframeSrc = manager
    ? buildIntegrationManagerUrl(manager.uiUrl, scalarToken, room.roomId)
    : null;

  useEffect(() => {
    if (!open) return undefined;

    const handleMessage = (event: MessageEvent) => {
      if (!manager) return;

      try {
        const managerOrigin = new URL(manager.uiUrl).origin;
        if (event.origin !== managerOrigin) return;
      } catch {
        return;
      }

      if (event.data?.action === 'close_scalar' || event.data?.action === 'close') {
        onClose();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [open, manager, onClose]);

  useEffect(() => {
    if (!open) setIframeLoaded(false);
  }, [open]);

  return (
    <Overlay open={open} backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: true,
            onDeactivate: onClose,
          }}
        >
          <Box className={css.IntegrationManagerOverlay} direction="Column">
            <Header className={css.IntegrationManagerHeader} variant="Background" size="600">
              <Box grow="Yes" alignItems="Center" gap="200">
                <Box grow="Yes" alignItems="Center" gap="200">
                  <Text size="H5" truncate>
                    Integration Manager
                  </Text>
                </Box>
                <Box shrink="No" alignItems="Center">
                  <IconButton variant="Background" onClick={onClose}>
                    <Icon src={Icons.Cross} />
                  </IconButton>
                </Box>
              </Box>
            </Header>

            <Box grow="Yes" direction="Column" alignItems="Center" justifyContent="Center">
              {loading && (
                <Box direction="Column" alignItems="Center" gap="300">
                  <Spinner size="400" />
                  <Text size="T300" priority="300">
                    Connecting to integration manager...
                  </Text>
                </Box>
              )}

              {error && (
                <Box direction="Column" alignItems="Center" gap="300">
                  <Text size="T300" priority="300">
                    Failed to connect: {error}
                  </Text>
                </Box>
              )}

              {!loading && !error && !manager && (
                <Box direction="Column" alignItems="Center" gap="300">
                  <Text size="T300" priority="300">
                    No integration manager available for this homeserver.
                  </Text>
                </Box>
              )}

              {!loading && !error && iframeSrc && (
                <>
                  {!iframeLoaded && (
                    <Box
                      direction="Column"
                      alignItems="Center"
                      gap="300"
                      style={{ position: 'absolute' }}
                    >
                      <Spinner size="400" />
                      <Text size="T300" priority="300">
                        Loading...
                      </Text>
                    </Box>
                  )}
                  <iframe
                    ref={iframeRef}
                    className={css.IntegrationManagerIframe}
                    title="Integration Manager"
                    src={iframeSrc}
                    sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                    allow="microphone; camera; encrypted-media; autoplay; clipboard-write; display-capture"
                    onLoad={() => setIframeLoaded(true)}
                    style={{
                      opacity: iframeLoaded ? 1 : 0,
                    }}
                  />
                </>
              )}
            </Box>
          </Box>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
