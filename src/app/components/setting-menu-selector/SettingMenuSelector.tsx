import type { RectCords } from 'folds';
import type { PopOut } from '$components/overlay-stack';
import { Box, Button, config, Menu, MenuItem, Scroll, Spinner, Text, toRem } from 'folds';
import { CaretDown, sizedIcon } from '$components/icons/phosphor';
import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
  useState,
} from 'react';

import { ResponsiveMenu } from '$components/ResponsiveMenu';

export type SettingMenuOption<T extends string | number> = {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

type MenuPosition = ComponentPropsWithoutRef<typeof PopOut>['position'];
type MenuAlign = ComponentPropsWithoutRef<typeof PopOut>['align'];

export type SettingMenuRenderTriggerArgs<T extends string | number> = {
  value: T;
  selectedOption: SettingMenuOption<T>;
  opened: boolean;
  loading: boolean;
  disabled: boolean;
  openMenu: MouseEventHandler<HTMLButtonElement>;
};

export type SettingMenuRenderOptionArgs<T extends string | number> = {
  option: SettingMenuOption<T>;
  selected: boolean;
  select: () => void;
};

export type SettingMenuSelectorProps<T extends string | number> = {
  value: T;
  options: SettingMenuOption<T>[];
  onSelect: (value: T) => void;
  disabled?: boolean;
  loading?: boolean;
  position?: MenuPosition;
  align?: MenuAlign;
  offset?: number;
  scrollable?: boolean;
  optionStyle?: CSSProperties;
  renderTrigger?: (args: SettingMenuRenderTriggerArgs<T>) => ReactNode;
  renderOption?: (args: SettingMenuRenderOptionArgs<T>) => ReactNode;
};

export function SettingMenuSelector<T extends string | number>({
  value,
  options,
  onSelect,
  disabled = false,
  loading = false,
  position = 'Bottom',
  align = 'End',
  offset = 5,
  scrollable = false,
  optionStyle,
  renderTrigger,
  renderOption,
}: SettingMenuSelectorProps<T>) {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const selectedLabel = selectedOption?.label ?? String(value);
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

  const optionItems = options.map((option) => {
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
          style={optionStyle}
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
        style={optionStyle}
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
  });

  const optionsContent = scrollable ? (
    <Box grow="Yes">
      <Scroll size="0" hideTrack visibility="Hover">
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          {optionItems}
        </Box>
      </Scroll>
    </Box>
  ) : (
    <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
      {optionItems}
    </Box>
  );

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
      after={loading ? <Spinner variant="Secondary" size="300" /> : sizedIcon(CaretDown, '300')}
      onClick={handleOpenMenu}
      disabled={isDisabled}
    >
      <Text size="T300">{selectedLabel}</Text>
    </Button>
  );

  return (
    <>
      {trigger}
      <ResponsiveMenu
        anchor={menuCords}
        requestClose={handleCloseMenu}
        offset={offset}
        position={position}
        align={align}
        returnFocusOnDeactivate
        arrowNavigation="both"
        mobile="dialog"
        menu={
          <Menu
            style={
              scrollable ? { maxHeight: '75dvh', maxWidth: toRem(300), display: 'flex' } : undefined
            }
          >
            {optionsContent}
          </Menu>
        }
      />
    </>
  );
}
