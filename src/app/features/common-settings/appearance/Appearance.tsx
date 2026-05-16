import { useState, type MouseEventHandler } from 'react';
import {
  Box,
  Text,
  IconButton,
  Icon,
  Icons,
  Scroll,
  Button,
  config,
  Menu,
  MenuItem,
  PopOut,
  type RectCords,
} from 'folds';
import { Page, PageContent, PageHeader } from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useRoom } from '$hooks/useRoom';

import { SequenceCardStyle } from '$features/common-settings/styles.css';
import { useShowPerRoomRoomIcon } from '$hooks/useShowRoomIcon';
import { useSetting } from '$state/hooks/settings';
import type { ShowRoomIcon } from '$state/settings';
import { settingsAtom } from '$state/settings';
import { stopPropagation } from '$utils/keyboard';
import FocusTrap from 'focus-trap-react';

export function SelectShowPerRoomRoomIcon({ roomId }: { roomId: string }) {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const showRoomIconItems = useShowPerRoomRoomIcon();
  const [showRoomIconArray, setShowRoomIconArray] = useSetting(settingsAtom, 'perRoomShowRoomIcon');
  const showRoomIcon = showRoomIconArray?.find((item) => item.roomId === roomId)?.display;

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (position?: ShowRoomIcon) => {
    let newShowRoomIconArray = showRoomIconArray.filter((item) => item.roomId !== roomId);
    if (position) newShowRoomIconArray = [...newShowRoomIconArray, { roomId, display: position }];
    setShowRoomIconArray(newShowRoomIconArray);
    setMenuCords(undefined);
  };

  return (
    <>
      <Button
        size="300"
        variant="Secondary"
        outlined
        fill="Soft"
        radii="300"
        after={<Icon size="300" src={Icons.ChevronBottom} />}
        onClick={handleMenu}
      >
        <Text size="T300">
          {showRoomIconItems.find((i) => i.layout === showRoomIcon)?.name ?? showRoomIcon}
        </Text>
      </Button>
      <PopOut
        anchor={menuCords}
        offset={5}
        position="Bottom"
        align="End"
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setMenuCords(undefined),
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
              isKeyBackward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                {showRoomIconItems.map((item) => (
                  <MenuItem
                    key={item.layout}
                    size="300"
                    variant={showRoomIcon === item.layout ? 'Primary' : 'Surface'}
                    radii="300"
                    onClick={() => handleSelect(item.layout)}
                  >
                    <Text size="T300">{item.name}</Text>
                  </MenuItem>
                ))}
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
    </>
  );
}

type AppearanceProps = {
  requestClose: () => void;
};
export function Appearance({ requestClose }: AppearanceProps) {
  const room = useRoom();

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Appearance
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Box direction="Column" gap="100">
                <Text size="L400">Visual Tweaks</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                >
                  <SettingTile
                    title="Show Room Icons In Sidebar"
                    description="When do you want to show the specific room icons in the sidebar within this space?"
                    after={<SelectShowPerRoomRoomIcon roomId={room.roomId} />}
                  />
                </SequenceCard>
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
