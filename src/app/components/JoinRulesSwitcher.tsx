import { useMemo } from 'react';
import { Button, Spinner, Text } from 'folds';
import { JoinRule } from '$types/matrix-sdk';
import { CaretDown, sizedIcon } from '$components/icons/phosphor';
import { getRoomIconComponent, type RoomPhosphorIcon } from '$components/icons/roomIcons';
import {
  SettingMenuSelector,
  type SettingMenuOption,
} from '$components/setting-menu-selector/SettingMenuSelector';

export type ExtraJoinRules = 'knock_restricted';
export type ExtendedJoinRules = JoinRule | ExtraJoinRules;

type JoinRuleIcons = Record<ExtendedJoinRules, RoomPhosphorIcon>;

export const useJoinRuleIcons = (roomType?: string): JoinRuleIcons =>
  useMemo(
    () => ({
      [JoinRule.Invite]: getRoomIconComponent(roomType, JoinRule.Invite),
      [JoinRule.Knock]: getRoomIconComponent(roomType, JoinRule.Knock),
      knock_restricted: getRoomIconComponent(roomType, JoinRule.Restricted),
      [JoinRule.Restricted]: getRoomIconComponent(roomType, JoinRule.Restricted),
      [JoinRule.Public]: getRoomIconComponent(roomType, JoinRule.Public),
      [JoinRule.Private]: getRoomIconComponent(roomType, JoinRule.Private),
    }),
    [roomType]
  );

type JoinRuleLabels = Record<ExtendedJoinRules, string>;
export const useRoomJoinRuleLabel = (): JoinRuleLabels =>
  useMemo(
    () => ({
      [JoinRule.Invite]: 'Invite Only',
      [JoinRule.Knock]: 'Knock & Invite',
      knock_restricted: 'Space Members or Knock',
      [JoinRule.Restricted]: 'Space Members',
      [JoinRule.Public]: 'Public',
      [JoinRule.Private]: 'Invite Only',
    }),
    []
  );

type JoinRulesSwitcherProps<T extends ExtendedJoinRules[]> = {
  icons: JoinRuleIcons;
  labels: JoinRuleLabels;
  rules: T;
  value: T[number];
  onChange: (value: T[number]) => void;
  disabled?: boolean;
  changing?: boolean;
};
export function JoinRulesSwitcher<T extends ExtendedJoinRules[]>({
  icons,
  labels,
  rules,
  value,
  onChange,
  disabled,
  changing,
}: JoinRulesSwitcherProps<T>) {
  const options: SettingMenuOption<ExtendedJoinRules>[] = rules.map((rule) => ({
    value: rule,
    label: labels[rule],
    icon: sizedIcon(icons[rule], '100'),
  }));

  return (
    <SettingMenuSelector
      value={value}
      options={options}
      onSelect={onChange}
      disabled={disabled}
      renderTrigger={({ openMenu }) => (
        <Button
          size="300"
          variant="Secondary"
          fill="Soft"
          radii="300"
          outlined
          before={sizedIcon(icons[value] ?? icons[JoinRule.Restricted], '100')}
          after={
            changing ? (
              <Spinner size="100" variant="Secondary" fill="Soft" />
            ) : (
              sizedIcon(CaretDown, '100')
            )
          }
          onClick={openMenu}
          disabled={disabled}
        >
          <Text size="B300">{labels[value] ?? 'Unsupported'}</Text>
        </Button>
      )}
    />
  );
}
