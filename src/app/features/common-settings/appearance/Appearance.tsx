import { Box, Text, Scroll } from 'folds';
import { PageContent, SettingsSectionPage } from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useRoom } from '$hooks/useRoom';

import { SequenceCardStyle } from '$features/common-settings/styles.css';
import { useShowPerRoomRoomIcon } from '$hooks/useShowRoomIcon';
import { useSetting } from '$state/hooks/settings';
import type { ShowRoomIcon } from '$state/settings';
import { settingsAtom } from '$state/settings';
import {
  SettingMenuSelector,
  type SettingMenuOption,
} from '$components/setting-menu-selector/SettingMenuSelector';

const DEFAULT_LAYOUT = 'default';
type LayoutValue = ShowRoomIcon | typeof DEFAULT_LAYOUT;

export function SelectShowPerRoomRoomIcon({ roomId }: { roomId: string }) {
  const showRoomIconItems = useShowPerRoomRoomIcon();
  const [showRoomIconArray, setShowRoomIconArray] = useSetting(settingsAtom, 'perRoomShowRoomIcon');
  const showRoomIcon = showRoomIconArray?.find((item) => item.roomId === roomId)?.display;

  const handleSelect = (position: LayoutValue) => {
    let newShowRoomIconArray = showRoomIconArray.filter((item) => item.roomId !== roomId);
    if (position !== DEFAULT_LAYOUT)
      newShowRoomIconArray = [...newShowRoomIconArray, { roomId, display: position }];
    setShowRoomIconArray(newShowRoomIconArray);
  };

  const options: SettingMenuOption<LayoutValue>[] = showRoomIconItems.map((item) => ({
    value: item.layout ?? DEFAULT_LAYOUT,
    label: item.name,
  }));

  return (
    <SettingMenuSelector
      value={showRoomIcon ?? DEFAULT_LAYOUT}
      options={options}
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
