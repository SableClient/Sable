import type { ReactNode } from 'react';
import { Box, Text, config } from 'folds';
import { Check, sizedIcon } from '$components/icons/phosphor';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { BetaNoticeBadge } from '$components/BetaNoticeBadge';
import { CreateRoomType } from './types';
import { useTranslation } from 'react-i18next';

type CreateRoomTypeSelectorProps = {
  value?: CreateRoomType;
  onSelect: (value: CreateRoomType) => void;
  disabled?: boolean;
  getIcon: (type: CreateRoomType) => ReactNode;
};
export function CreateRoomTypeSelector({
  value,
  onSelect,
  disabled,
  getIcon,
}: CreateRoomTypeSelectorProps) {
  const { t } = useTranslation('room/create');
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
          before={getIcon(CreateRoomType.TextRoom)}
          after={value === CreateRoomType.TextRoom && sizedIcon(Check)}
        >
          <Box gap="200" alignItems="Baseline">
            <Text size="H6" style={{ flexShrink: 0 }}>
              {t('chat_room')}
            </Text>
            <Text size="T300" priority="300" truncate>
              {t('messages_photos_and_videos')}
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
          before={getIcon(CreateRoomType.VoiceRoom)}
          after={value === CreateRoomType.VoiceRoom && sizedIcon(Check)}
        >
          <Box gap="200" alignItems="Baseline">
            <Text size="H6" style={{ flexShrink: 0 }}>
              {t('voice_room')}
            </Text>
            <Text size="T300" priority="300" truncate>
              {t('live_audio_and_video_conversations')}
            </Text>
            <BetaNoticeBadge />
          </Box>
        </SettingTile>
      </SequenceCard>
    </Box>
  );
}
