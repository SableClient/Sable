import type { MouseEventHandler } from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { RectCords } from 'folds';
import { config, Box, MenuItem, Text, PopOut, Menu, Button, Spinner } from 'folds';
import { JoinRule } from '$types/matrix-sdk';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '$utils/keyboard';
import { CaretDown, iconAt } from '$components/icons/phosphor';
import { getRoomIconComponent, type RoomPhosphorIcon } from '$components/icons/roomIcons';

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
  const [cords, setCords] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleChange = useCallback(
    (selectedRule: ExtendedJoinRules) => {
      setCords(undefined);
      onChange(selectedRule);
    },
    [onChange]
  );

  return (
    <PopOut
      anchor={cords}
      position="Bottom"
      align="End"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setCords(undefined),
            clickOutsideDeactivates: true,
            isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
            isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu>
            <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
              {rules.map((rule) => (
                <MenuItem
                  key={rule}
                  size="300"
                  variant="Surface"
                  radii="300"
                  aria-pressed={value === rule}
                  onClick={() => handleChange(rule)}
                  before={iconAt(icons[rule], '100')}
                  disabled={disabled}
                >
                  <Box grow="Yes">
                    <Text size="T300">{labels[rule]}</Text>
                  </Box>
                </MenuItem>
              ))}
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <Button
        size="300"
        variant="Secondary"
        fill="Soft"
        radii="300"
        outlined
        before={iconAt(icons[value] ?? icons[JoinRule.Restricted], '100')}
        after={
          changing ? (
            <Spinner size="100" variant="Secondary" fill="Soft" />
          ) : (
            iconAt(CaretDown, '100')
          )
        }
        onClick={handleOpenMenu}
        disabled={disabled}
      >
        <Text size="B300">{labels[value] ?? 'Unsupported'}</Text>
      </Button>
    </PopOut>
  );
}
