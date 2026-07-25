import { Box, Text, Scroll } from 'folds';
import { PageContent, SettingsSectionPage } from '$components/page';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useRoom } from '$hooks/useRoom';

import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import {
  PER_ROOM_SHOW_ROOM_ICON_OPTIONS,
  SHOW_ROOM_ICON_DEFAULT,
  SettingMenuSelector,
  type ShowRoomIconValue,
} from '$components/setting-menu-selector';

export function SelectShowPerRoomRoomIcon({ roomId }: { roomId: string }) {
  const [showRoomIconArray, setShowRoomIconArray] = useSetting(settingsAtom, 'perRoomShowRoomIcon');
  const showRoomIcon = showRoomIconArray?.find((item) => item.roomId === roomId)?.display;

  const handleSelect = (position: ShowRoomIconValue) => {
    let newShowRoomIconArray = showRoomIconArray.filter((item) => item.roomId !== roomId);
    if (position !== SHOW_ROOM_ICON_DEFAULT)
      newShowRoomIconArray = [...newShowRoomIconArray, { roomId, display: position }];
    setShowRoomIconArray(newShowRoomIconArray);
  };

  return (
    <SettingMenuSelector
      value={showRoomIcon ?? SHOW_ROOM_ICON_DEFAULT}
      options={PER_ROOM_SHOW_ROOM_ICON_OPTIONS}
      onSelect={handleSelect}
      renderOption={({ option, selected }) => (
        <Box grow="Yes">
          <Text size="T300">{selected ? <b>{option.label}</b> : option.label}</Text>
        </Box>
      )}
    />
  );
}

type AppearanceProps = {
  requestBack?: () => void;
  requestClose: () => void;
};
export function Appearance({ requestBack, requestClose }: AppearanceProps) {
  const room = useRoom();

  return (
    <SettingsSectionPage title="Appearance" requestBack={requestBack} requestClose={requestClose}>
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
    </SettingsSectionPage>
  );
}
