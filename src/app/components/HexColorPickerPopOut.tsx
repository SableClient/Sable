import FocusTrap from 'focus-trap-react';
import type { RectCords } from 'folds';
import { Box, Button, config, Menu, Text } from 'folds';
import { HexColorPicker } from 'react-colorful';
import { PopOut } from '$components/overlay-stack';
import type { MouseEventHandler, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { stopPropagation } from '$utils/keyboard';

type HexColorPickerPopOutProps = {
  children: (onOpen: MouseEventHandler<HTMLElement>, opened: boolean) => ReactNode;
  color: string;
  onChange: (color: string) => void;
  onRemove?: () => void;
};
const isValidHexColor = (color: string) => /^#[0-9A-F]{6}$/i.test(color);

export function HexColorPickerPopOut({
  color,
  onChange,
  onRemove,
  children,
}: HexColorPickerPopOutProps) {
  const [cords, setCords] = useState<RectCords>();
  const [pickerColor, setPickerColor] = useState(isValidHexColor(color) ? color : '#FFFFFF');

  useEffect(() => {
    if (isValidHexColor(color)) setPickerColor(color);
  }, [color]);

  const handleOpen: MouseEventHandler<HTMLElement> = (evt) => {
    setCords(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <PopOut
      anchor={cords}
      position="Bottom"
      align="Center"
      content={
        <FocusTrap
          focusTrapOptions={{
            onDeactivate: () => setCords(undefined),
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu
            style={{
              padding: config.space.S100,
              borderRadius: config.radii.R500,
              overflow: 'initial',
            }}
          >
            <Box direction="Column" gap="200">
              <HexColorPicker
                color={pickerColor}
                onChange={(newColor) => {
                  setPickerColor(newColor);
                  onChange(newColor);
                }}
              />
              {onRemove && (
                <Button
                  size="300"
                  variant="Secondary"
                  fill="Soft"
                  radii="400"
                  onClick={() => onRemove()}
                >
                  <Text size="B300">Remove</Text>
                </Button>
              )}
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      {children(handleOpen, !!cords)}
    </PopOut>
  );
}
