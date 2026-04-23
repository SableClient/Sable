import type { MouseEventHandler, ReactNode } from 'react';
import { forwardRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import type { RectCords } from 'folds';
import { Box, config, Menu, MenuItem, PopOut, Scroll, Text, toRem } from 'folds';
import type { PowerLevelTags } from '$hooks/usePowerLevelTags';
import { getPowers } from '$hooks/usePowerLevelTags';
import { stopPropagation } from '$utils/keyboard';
import { PowerColorBadge } from './PowerColorBadge';

type PowerSelectorProps = {
  powerLevelTags: PowerLevelTags;
  value: number;
  onChange: (value: number) => void;
};
export const PowerSelector = forwardRef<HTMLDivElement, PowerSelectorProps>(
  ({ powerLevelTags, value, onChange }, ref) => (
    <Menu
      ref={ref}
      style={{
        maxHeight: '75vh',
        maxWidth: toRem(300),
        display: 'flex',
      }}
    >
      <Box grow="Yes">
        <Scroll size="0" hideTrack visibility="Hover">
          <div style={{ padding: config.space.S100 }}>
            {getPowers(powerLevelTags).map((power) => {
              const selected = value === power;
              const tag = powerLevelTags[power];

              return (
                <MenuItem
                  key={power}
                  aria-pressed={selected}
                  radii="300"
                  onClick={selected ? undefined : () => onChange(power)}
                  before={<PowerColorBadge color={tag!.color} />}
                  after={<Text size="L400">{power}</Text>}
                >
                  <Text style={{ flexGrow: 1 }} size="B400" truncate>
                    {tag!.name}
                  </Text>
                </MenuItem>
              );
            })}
          </div>
        </Scroll>
      </Box>
    </Menu>
  )
);

type PowerSwitcherProps = PowerSelectorProps & {
  children: (handleOpen: MouseEventHandler<HTMLButtonElement>, opened: boolean) => ReactNode;
};
export function PowerSwitcher({ powerLevelTags, value, onChange, children }: PowerSwitcherProps) {
  const [menuCords, setMenuCords] = useState<RectCords>();

  const handleOpen: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <PopOut
      anchor={menuCords}
      offset={5}
      position="Bottom"
      align="End"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setMenuCords(undefined),
            clickOutsideDeactivates: true,
            isKeyForward: (evt: KeyboardEvent) =>
              evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
            isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
            escapeDeactivates: stopPropagation,
          }}
        >
          <PowerSelector
            powerLevelTags={powerLevelTags}
            value={value}
            onChange={(v) => {
              onChange(v);
              setMenuCords(undefined);
            }}
          />
        </FocusTrap>
      }
    >
      {children(handleOpen, !!menuCords)}
    </PopOut>
  );
}
