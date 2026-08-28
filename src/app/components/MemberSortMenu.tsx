import FocusTrap from 'focus-trap-react';
import { config, Menu, MenuItem, Text } from 'folds';
import { stopPropagation } from '$utils/keyboard';

type MemberMenuItem = {
  name: string;
};

type MemberMenuListProps = {
  items: MemberMenuItem[];
  requestClose: () => void;
  selected: number;
  onSelect: (index: number) => void;
};
export function MemberMenuList({ items, selected, onSelect, requestClose }: MemberMenuListProps) {
  return (
    <FocusTrap
      focusTrapOptions={{
        initialFocus: false,
        onDeactivate: requestClose,
        clickOutsideDeactivates: true,
        isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
        isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
        escapeDeactivates: stopPropagation,
      }}
    >
      <Menu style={{ padding: config.space.S100 }}>
        {items.map((menuItem, index) => (
          <MenuItem
            key={menuItem.name}
            variant="Surface"
            aria-pressed={selected === index}
            size="300"
            radii="300"
            onClick={() => {
              onSelect(index);
              requestClose();
            }}
          >
            <Text size="T300">{menuItem.name}</Text>
          </MenuItem>
        ))}
      </Menu>
    </FocusTrap>
  );
}
