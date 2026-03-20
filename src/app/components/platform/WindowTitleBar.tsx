import { useCallback, useEffect, useState } from 'react';
import { Box, Icon, IconButton, Icons, Text } from 'folds';
import { getPlatform } from '$platform/index';
import * as css from './WindowTitleBar.css';

const TITLE_BAR_HEIGHT = 32;

export function WindowTitleBar() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    getPlatform().then((p) => {
      setIsDesktop(p.isDesktop);
      if (p.isDesktop) {
        // Push page content below the fixed title bar
        document.documentElement.style.paddingTop = `${TITLE_BAR_HEIGHT}px`;
      }
    });
    return () => {
      document.documentElement.style.paddingTop = '';
    };
  }, []);

  const handleMinimize = useCallback(async () => {
    const p = await getPlatform();
    await p.minimizeWindow();
  }, []);

  const handleMaximize = useCallback(async () => {
    const p = await getPlatform();
    await p.toggleMaximizeWindow();
  }, []);

  const handleClose = useCallback(async () => {
    const p = await getPlatform();
    await p.closeWindow();
  }, []);

  if (!isDesktop) return null;

  return (
    <Box
      className={css.TitleBar}
      direction="Row"
      alignItems="Center"
      justifyContent="End"
      data-tauri-drag-region
    >
      <Box
        className={css.TitleBarDragRegion}
        grow="Yes"
        alignItems="Center"
        data-tauri-drag-region
      >
        <Text className={css.TitleBarTitle} size="T200" data-tauri-drag-region>
          SableD Client
        </Text>
      </Box>
      <Box direction="Row" alignItems="Center" gap="0">
        <IconButton
          className={css.TitleBarButton}
          variant="Background"
          size="300"
          radii="0"
          onClick={handleMinimize}
          aria-label="Minimize"
        >
          <Icon size="200" src={Icons.Minus} />
        </IconButton>
        <IconButton
          className={css.TitleBarButton}
          variant="Background"
          size="300"
          radii="0"
          onClick={handleMaximize}
          aria-label="Maximize"
        >
          <Icon size="200" src={Icons.Plus} />
        </IconButton>
        <IconButton
          className={css.TitleBarCloseButton}
          variant="Background"
          size="300"
          radii="0"
          onClick={handleClose}
          aria-label="Close"
        >
          <Icon size="200" src={Icons.Cross} />
        </IconButton>
      </Box>
    </Box>
  );
}
