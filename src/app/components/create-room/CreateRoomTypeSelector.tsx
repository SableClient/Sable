import type { IconSrc } from 'folds';
import { Box, Text, Icon, Icons, config } from 'folds';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { BetaNoticeBadge } from '$components/BetaNoticeBadge';
import { CreateRoomType } from './types';
import { t } from 'i18next';

type CreateRoomTypeSelectorProps = {
  value?: CreateRoomType;
  onSelect: (value: CreateRoomType) => void;
  disabled?: boolean;
  getIcon: (type: CreateRoomType) => IconSrc;
};
export function CreateRoomTypeSelector({
  value,
  onSelect,
  disabled,
  getIcon,
}: CreateRoomTypeSelectorProps) {
  return (
    <Box shrink="No" direction="Column" gap="100">
      <SequenceCard
        style={{ padding: config.space.S300 }}
        variant={value === CreateRoomType.TextRoom ? 'Primary' : 'SurfaceVariant'}
        direction="Column"
        gap="100"
        as="button"
        type="button"
        aria-pressed={value === CreateRoomType.TextRoom}
        onClick={() => onSelect(CreateRoomType.TextRoom)}
        disabled={disabled}
      >
        <SettingTile
          before={<Icon size="400" src={getIcon(CreateRoomType.TextRoom)} />}
          after={value === CreateRoomType.TextRoom && <Icon src={Icons.Check} />}
        >
          <Box gap="200" alignItems="Baseline">
            <Text size="H6" style={{ flexShrink: 0 }}>
              {t('RoomCreate.chat_room')}
            </Text>
            <Text size="T300" priority="300" truncate>
              {t('RoomCreate.messages_photos_and_videos')}
            </Text>
          </Box>
        </SettingTile>
      </SequenceCard>
      <SequenceCard
        style={{ padding: config.space.S300 }}
        variant={value === CreateRoomType.VoiceRoom ? 'Primary' : 'SurfaceVariant'}
        direction="Column"
        gap="100"
        as="button"
        type="button"
        aria-pressed={value === CreateRoomType.VoiceRoom}
        onClick={() => onSelect(CreateRoomType.VoiceRoom)}
        disabled={disabled}
      >
        <SettingTile
          before={<Icon size="400" src={getIcon(CreateRoomType.VoiceRoom)} />}
          after={value === CreateRoomType.VoiceRoom && <Icon src={Icons.Check} />}
        >
          <Box gap="200" alignItems="Baseline">
            <Text size="H6" style={{ flexShrink: 0 }}>
              {t('RoomCreate.voice_room')}
            </Text>
            <Text size="T300" priority="300" truncate>
              {t('RoomCreate.live_audio_and_video_conversations')}
            </Text>
            <BetaNoticeBadge />
          </Box>
        </SettingTile>
      </SequenceCard>
    </Box>
  );
}
