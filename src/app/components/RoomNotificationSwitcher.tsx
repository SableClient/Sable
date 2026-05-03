import { Box, Icon, Text } from 'folds';
import type { ReactNode } from 'react';
import { type MouseEventHandler } from 'react';
import { SettingMenuSelector, type SettingMenuOption } from '$components/setting-menu-selector';
import {
  getRoomNotificationModeIcon,
  RoomNotificationMode,
  useSetRoomNotificationPreference,
} from '$hooks/useRoomsNotificationPreferences';
import { AsyncStatus } from '$hooks/useAsyncCallback';

const ROOM_NOTIFICATION_MODE_LABELS: Record<RoomNotificationMode, string> = {
  [RoomNotificationMode.Unset]: 'Default',
  [RoomNotificationMode.AllMessages]: 'All Messages',
  [RoomNotificationMode.SpecialMessages]: 'Mention & Keywords',
  [RoomNotificationMode.Mute]: 'Mute',
};

const ROOM_NOTIFICATION_MODE_OPTIONS: SettingMenuOption<RoomNotificationMode>[] = [
  RoomNotificationMode.Unset,
  RoomNotificationMode.AllMessages,
  RoomNotificationMode.SpecialMessages,
  RoomNotificationMode.Mute,
].map((mode) => ({
  value: mode,
  label: ROOM_NOTIFICATION_MODE_LABELS[mode],
  description:
    mode === RoomNotificationMode.Unset ? 'Follows your global notification rules' : undefined,
}));

type NotificationModeSwitcherProps = {
  roomId: string;
  value?: RoomNotificationMode;
  children: (
    handleOpen: MouseEventHandler<HTMLButtonElement>,
    opened: boolean,
    changing: boolean
  ) => ReactNode;
};
export function RoomNotificationModeSwitcher({
  roomId,
  value = RoomNotificationMode.Unset,
  children,
}: NotificationModeSwitcherProps) {
  const { modeState, setMode } = useSetRoomNotificationPreference(roomId);
  const changing = modeState.status === AsyncStatus.Loading;

  return (
    <SettingMenuSelector
      value={value}
      options={ROOM_NOTIFICATION_MODE_OPTIONS}
      onSelect={(mode) => setMode(mode, value)}
      loading={changing}
      offset={5}
      position="Right"
      align="Start"
      renderTrigger={({ openMenu, opened }) => children(openMenu, opened, changing)}
      renderOption={({ option, selected }) => (
        <Box
          alignItems="Center"
          gap="200"
          style={option.value === RoomNotificationMode.Unset ? { minHeight: '48px' } : undefined}
        >
          <Icon size="100" src={getRoomNotificationModeIcon(option.value)} filled={selected} />
          <Box direction="Column" gap="100">
            <Text size="T300">{selected ? <b>{option.label}</b> : option.label}</Text>
            {option.description && (
              <Text size="T200" priority="300">
                {option.description}
              </Text>
            )}
          </Box>
        </Box>
      )}
    />
  );
}
