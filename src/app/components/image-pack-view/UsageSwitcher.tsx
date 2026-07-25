import { useMemo } from 'react';
import { Button, Text } from 'folds';
import { CaretDown, sizedIcon } from '$components/icons/phosphor';
import { ImageUsage } from '$plugins/custom-emoji';
import {
  SettingMenuSelector,
  type SettingMenuOption,
} from '$components/setting-menu-selector/SettingMenuSelector';

const getUsageStr = (usage: ImageUsage[]): string => {
  const sticker = usage.includes(ImageUsage.Sticker);
  const emoticon = usage.includes(ImageUsage.Emoticon);

  if (sticker && emoticon) return 'Both';
  if (sticker) return 'Sticker';
  if (emoticon) return 'Emoji';
  return 'Both';
};

export const useUsageStr = (): ((usage: ImageUsage[]) => string) => getUsageStr;

const ALL_USAGES: ImageUsage[][] = [
  [ImageUsage.Emoticon],
  [ImageUsage.Sticker],
  [ImageUsage.Sticker, ImageUsage.Emoticon],
];

type UsageSwitcherProps = {
  usage: ImageUsage[];
  canEdit?: boolean;
  onChange: (usage: ImageUsage[]) => void;
};
export function UsageSwitcher({ usage, onChange, canEdit }: UsageSwitcherProps) {
  const formatUsageStr = useUsageStr();

  const options: SettingMenuOption<string>[] = useMemo(
    () => ALL_USAGES.map((usg) => ({ value: formatUsageStr(usg), label: formatUsageStr(usg) })),
    [formatUsageStr]
  );

  const handleSelect = (usageStr: string) => {
    const selectedUsage = ALL_USAGES.find((usg) => formatUsageStr(usg) === usageStr);
    if (selectedUsage) onChange(selectedUsage);
  };

  return (
    <SettingMenuSelector
      value={formatUsageStr(usage)}
      options={options}
      onSelect={handleSelect}
      renderTrigger={({ openMenu }) => (
        <Button
          variant="Secondary"
          fill="Soft"
          size="300"
          radii="300"
          type="button"
          outlined
          aria-disabled={!canEdit}
          after={canEdit && sizedIcon(CaretDown, '100')}
          onClick={canEdit ? openMenu : undefined}
        >
          <Text size="B300">{formatUsageStr(usage)}</Text>
        </Button>
      )}
      renderOption={({ option, selected }) => (
        <Text size="T300">{selected ? <b>{option.label}</b> : option.label}</Text>
      )}
    />
  );
}
