import { Box, Text, config } from 'folds';
import { ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { PhosphorIcon } from '$components/PhosphorIcon';
import { CreateRoomAccess } from './types';

type CreateRoomAccessSelectorProps = {
  value?: CreateRoomAccess;
  onSelect: (value: CreateRoomAccess) => void;
  canRestrict?: boolean;
  disabled?: boolean;
  getIcon: (access: CreateRoomAccess) => ComponentType<IconProps>;
};
export function CreateRoomAccessSelector({
  value,
  onSelect,
  canRestrict,
  disabled,
  getIcon,
}: CreateRoomAccessSelectorProps) {
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
            before={<PhosphorIcon size="400" as={getIcon(CreateRoomAccess.Restricted)} />}
            after={value === CreateRoomAccess.Restricted && <PhosphorIcon as={CheckIcon} />}
          >
            <Text size="H6">Restricted</Text>
            <Text size="T300" priority="300">
              Only member of parent space can join.
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
          before={<PhosphorIcon size="400" as={getIcon(CreateRoomAccess.Private)} />}
          after={value === CreateRoomAccess.Private && <PhosphorIcon as={CheckIcon} />}
        >
          <Text size="H6">Private</Text>
          <Text size="T300" priority="300">
            Only people with invite can join.
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
          before={<PhosphorIcon size="400" as={getIcon(CreateRoomAccess.Public)} />}
          after={value === CreateRoomAccess.Public && <PhosphorIcon as={CheckIcon} />}
        >
          <Text size="H6">Public</Text>
          <Text size="T300" priority="300">
            Anyone with the address can join.
          </Text>
        </SettingTile>
      </SequenceCard>
    </Box>
  );
}
