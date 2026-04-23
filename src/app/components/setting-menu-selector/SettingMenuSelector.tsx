import FocusTrap from 'focus-trap-react';
import type { RectCords } from 'folds';
import { Box, Button, config, Icon, Icons, Menu, MenuItem, PopOut, Spinner, Text } from 'folds';
import {
  type ComponentPropsWithoutRef,
  type MouseEventHandler,
  type ReactNode,
  useState,
} from 'react';

import { stopPropagation } from '$utils/keyboard';

export type SettingMenuOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

type MenuPosition = ComponentPropsWithoutRef<typeof PopOut>['position'];
type MenuAlign = ComponentPropsWithoutRef<typeof PopOut>['align'];

export type SettingMenuRenderTriggerArgs<T extends string> = {
  value: T;
  selectedOption: SettingMenuOption<T>;
  opened: boolean;
  loading: boolean;
  disabled: boolean;
  openMenu: MouseEventHandler<HTMLButtonElement>;
};

export type SettingMenuRenderOptionArgs<T extends string> = {
  option: SettingMenuOption<T>;
  selected: boolean;
  select: () => void;
};

export type SettingMenuSelectorProps<T extends string> = {
  value: T;
  options: SettingMenuOption<T>[];
  onSelect: (value: T) => void;
  disabled?: boolean;
  loading?: boolean;
  position?: MenuPosition;
  align?: MenuAlign;
  offset?: number;
  renderTrigger?: (args: SettingMenuRenderTriggerArgs<T>) => ReactNode;
  renderOption?: (args: SettingMenuRenderOptionArgs<T>) => ReactNode;
};

export function SettingMenuSelector<T extends string>({
  value,
  options,
  onSelect,
  disabled = false,
  loading = false,
  position = 'Bottom',
  align = 'End',
  offset = 5,
  renderTrigger,
  renderOption,
}: SettingMenuSelectorProps<T>) {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const selectedLabel = selectedOption?.label ?? value;
  const isDisabled = disabled || loading;

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    if (isDisabled) return;
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleCloseMenu = () => {
    setMenuCords(undefined);
  };

  const handleSelect = (nextValue: T) => {
    handleCloseMenu();
    onSelect(nextValue);
  };

  const trigger = renderTrigger ? (
    renderTrigger({
      value,
      selectedOption: selectedOption ?? { value, label: selectedLabel },
      opened: !!menuCords,
      loading,
      disabled: isDisabled,
      openMenu: handleOpenMenu,
    })
  ) : (
    <Button
      size="300"
      variant="Secondary"
      outlined
      fill="Soft"
      radii="300"
      after={
        loading ? (
          <Spinner variant="Secondary" size="300" />
        ) : (
          <Icon size="300" src={Icons.ChevronBottom} />
        )
      }
      onClick={handleOpenMenu}
      disabled={isDisabled}
    >
      <Text size="T300">{selectedLabel}</Text>
    </Button>
  );

  return (
    <>
      {trigger}
      <PopOut
        anchor={menuCords}
        offset={offset}
        position={position}
        align={align}
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              fallbackFocus: () => document.body,
              onDeactivate: handleCloseMenu,
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
              isKeyBackward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                {options.map((option) => {
                  const selected = option.value === value;
                  const select = () => {
                    if (option.disabled) return;
                    handleSelect(option.value);
                  };

                  if (renderOption) {
                    return (
                      <MenuItem
                        key={option.value}
                        size="300"
                        variant="Surface"
                        radii="300"
                        aria-selected={selected}
                        disabled={option.disabled || isDisabled}
                        onClick={select}
                      >
                        {renderOption({ option, selected, select })}
                      </MenuItem>
                    );
                  }

                  return (
                    <MenuItem
                      key={option.value}
                      size="300"
                      variant="Surface"
                      aria-selected={selected}
                      radii="300"
                      disabled={option.disabled || isDisabled}
                      onClick={select}
                      before={option.icon}
                    >
                      <Box grow="Yes">
                        <Box direction="Column" gap="100">
                          <Text size="T300">{option.label}</Text>
                          {option.description && (
                            <Text size="T200" priority="300">
                              {option.description}
                            </Text>
                          )}
                        </Box>
                      </Box>
                    </MenuItem>
                  );
                })}
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
    </>
  );
}
