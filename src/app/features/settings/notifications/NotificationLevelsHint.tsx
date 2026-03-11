import { MouseEventHandler, useState } from 'react';
import { Box, config, Header, Icon, IconButton, Icons, Menu, PopOut, RectCords, Text } from 'folds';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '$utils/keyboard';

export function NotificationLevelsHint() {
  const [anchor, setAnchor] = useState<RectCords>();

  const handleOpen: MouseEventHandler<HTMLElement> = (evt) => {
    setAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const itemPadding = { padding: config.space.S200, paddingTop: 0 };

  return (
    <PopOut
      anchor={anchor}
      position="Bottom"
      align="End"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setAnchor(undefined),
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu style={{ maxWidth: '280px' }}>
            <Header size="300" style={{ padding: `0 ${config.space.S200}` }}>
              <Text size="L400">Notification Levels</Text>
            </Header>
            <Box direction="Column" style={itemPadding} gap="300" tabIndex={0}>
              <Box direction="Column" gap="100">
                <Text size="L400">Disable</Text>
                <Text size="T300" priority="300">
                  The rule is muted. No notifications of any kind.
                </Text>
              </Box>
              <Box direction="Column" gap="100">
                <Text size="L400">Notify Silent</Text>
                <Text size="T300" priority="300">
                  Visual notification (badge and banner) when a relevant message arrives. No sound.
                </Text>
              </Box>
              <Box direction="Column" gap="100">
                <Text size="L400">Notify Loud</Text>
                <Text size="T300" priority="300">
                  Visual highlight plus sound. Respects the Notification Sound setting above, and
                  triggers sound and vibration on mobile push.
                </Text>
              </Box>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <IconButton
        onClick={handleOpen}
        type="button"
        variant="Secondary"
        size="300"
        radii="300"
        aria-pressed={!!anchor}
      >
        <Icon style={{ opacity: config.opacity.P300 }} size="100" src={Icons.Info} />
      </IconButton>
    </PopOut>
  );
}
