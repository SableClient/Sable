import type { MouseEventHandler, ReactNode } from 'react';
import { Box, Text } from 'folds';
import type { PowerLevelTags } from '$hooks/usePowerLevelTags';
import { getPowers } from '$hooks/usePowerLevelTags';
import { PowerColorBadge } from './PowerColorBadge';
import {
  SettingMenuSelector,
  type SettingMenuOption,
} from '$components/setting-menu-selector/SettingMenuSelector';

type PowerSwitcherProps = {
  powerLevelTags: PowerLevelTags;
  value: number;
  onChange: (value: number) => void;
  children: (handleOpen: MouseEventHandler<HTMLButtonElement>, opened: boolean) => ReactNode;
};
export function PowerSwitcher({ powerLevelTags, value, onChange, children }: PowerSwitcherProps) {
  const options: SettingMenuOption<number>[] = getPowers(powerLevelTags).map((power) => ({
    value: power,
    label: powerLevelTags[power]!.name,
  }));

  return (
    <SettingMenuSelector
      value={value}
      options={options}
      onSelect={onChange}
      scrollable
      renderTrigger={({ openMenu, opened }) => children(openMenu, opened)}
      renderOption={({ option }) => {
        const tag = powerLevelTags[option.value]!;
        return (
          <Box alignItems="Center" gap="200" grow="Yes">
            <PowerColorBadge color={tag.color} />
            <Text style={{ flexGrow: 1 }} size="B400" truncate>
              {tag.name}
            </Text>
            <Text size="L400">{option.value}</Text>
          </Box>
        );
      }}
    />
  );
}
