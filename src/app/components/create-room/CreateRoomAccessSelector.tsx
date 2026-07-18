import type { ReactNode } from 'react';
import { Box, Text, config } from 'folds';
import { Check, sizedIcon } from '$components/icons/phosphor';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { CreateRoomAccess } from './types';
import { useTranslation } from 'react-i18next';

type CreateRoomAccessSelectorProps = {
  value?: CreateRoomAccess;
  onSelect: (value: CreateRoomAccess) => void;
  canRestrict?: boolean;
  disabled?: boolean;
  getIcon: (access: CreateRoomAccess) => ReactNode;
};
export function CreateRoomAccessSelector({
  value,
  onSelect,
  canRestrict,
  disabled,
  getIcon,
}: CreateRoomAccessSelectorProps) {
  const { t } = useTranslation('room/create');
  return (
    <Box shrink="No" direction="Column" gap="100">
      {canRestrict && (
        <SequenceCard
          style={{ padding: config.space.S300 }}
          variant={value === CreateRoomAccess.Restricted ? 'Primary' : 'SurfaceVariant'}
          direction="Column"
          gap="100"
          as="button"
          type="button"
          aria-pressed={value === CreateRoomAccess.Restricted}
          onClick={() => onSelect(CreateRoomAccess.Restricted)}
          disabled={disabled}
        >
          <SettingTile
            before={getIcon(CreateRoomAccess.Restricted)}
            after={value === CreateRoomAccess.Restricted && sizedIcon(Check)}
          >
            <Text size="H6">Restricted</Text>
            <Text size="T300" priority="300">
              {t('only_member_of_parent_space_can_join')}
            </Text>
          </SettingTile>
        </SequenceCard>
      )}
      <SequenceCard
        style={{ padding: config.space.S300 }}
        variant={value === CreateRoomAccess.Private ? 'Primary' : 'SurfaceVariant'}
        direction="Column"
        gap="100"
        as="button"
        type="button"
        aria-pressed={value === CreateRoomAccess.Private}
        onClick={() => onSelect(CreateRoomAccess.Private)}
        disabled={disabled}
      >
        <SettingTile
          before={getIcon(CreateRoomAccess.Private)}
          after={value === CreateRoomAccess.Private && sizedIcon(Check)}
        >
          <Text size="H6">{t('private')}</Text>
          <Text size="T300" priority="300">
            {t('only_people_with_invite_can_join')}
          </Text>
        </SettingTile>
      </SequenceCard>
      <SequenceCard
        style={{ padding: config.space.S300 }}
        variant={value === CreateRoomAccess.Public ? 'Primary' : 'SurfaceVariant'}
        direction="Column"
        gap="100"
        as="button"
        type="button"
        aria-pressed={value === CreateRoomAccess.Public}
        onClick={() => onSelect(CreateRoomAccess.Public)}
        disabled={disabled}
      >
        <SettingTile
          before={getIcon(CreateRoomAccess.Public)}
          after={value === CreateRoomAccess.Public && sizedIcon(Check)}
        >
          <Text size="H6">{t('public')}</Text>
          <Text size="T300" priority="300">
            {t('anyone_with_the_address_can_join')}
          </Text>
        </SettingTile>
      </SequenceCard>
    </Box>
  );
}
