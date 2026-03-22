import { ComponentType, MouseEventHandler, useCallback, useMemo, useState } from 'react';
import { config, Box, MenuItem, Text, RectCords, PopOut, Menu, Button, Spinner } from 'folds';
import type { IconProps } from '@phosphor-icons/react';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { PhosphorIcon } from '$components/PhosphorIcon';
import { JoinRule } from '$types/matrix-sdk';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '$utils/keyboard';
import { getRoomIcon } from '$utils/room';

export type ExtraJoinRules = 'knock_restricted';
export type ExtendedJoinRules = JoinRule | ExtraJoinRules;

type JoinRuleIcons = Record<ExtendedJoinRules, ComponentType<IconProps>>;

export const useJoinRuleIcons = (roomType?: string): JoinRuleIcons =>
  useMemo(
    () => ({
      [JoinRule.Invite]: getRoomIcon(roomType, JoinRule.Invite),
      [JoinRule.Knock]: getRoomIcon(roomType, JoinRule.Knock),
      knock_restricted: getRoomIcon(roomType, JoinRule.Restricted),
      [JoinRule.Restricted]: getRoomIcon(roomType, JoinRule.Restricted),
      [JoinRule.Public]: getRoomIcon(roomType, JoinRule.Public),
      [JoinRule.Private]: getRoomIcon(roomType, JoinRule.Private),
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
                  before={<PhosphorIcon size="100" as={icons[rule]} />}
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
        before={<PhosphorIcon size="100" as={icons[value] ?? icons[JoinRule.Restricted]} />}
        after={
          changing ? (
            <Spinner size="100" variant="Secondary" fill="Soft" />
          ) : (
            <PhosphorIcon size="100" as={CaretDownIcon} />
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
