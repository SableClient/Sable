import { useState, useEffect } from 'react';
import { Box, Button, config, color, Text, Input, IconButton } from 'folds';
import { menuIcon, X } from '$components/icons/phosphor';
import { SettingTile } from '$components/setting-tile';
import { HexColorPickerPopOut } from '$components/HexColorPickerPopOut';
import { isValidHex } from '$hooks/useUserProfile';

type NameColorEditorProps = {
  title: string;
  description?: string;
  focusId?: string;
  current?: string;
  newNameColor?: string;
  onChange?: (color: string | null) => void;
  onSave?: (color: string | null) => void;
  disabled?: boolean;
};

const stripQuotes = (str?: string) => {
  if (!str) return '';
  // to solve the silly tuwunel
  return str.replaceAll(/^["']|["']$/g, '');
};

export function NameColorEditor({
  title,
  description,
  focusId,
  current,
  newNameColor,
  onChange,
  onSave,
  disabled,
}: Readonly<NameColorEditorProps>) {
  const [tempColor, setTempColor] = useState(
    stripQuotes(newNameColor) || stripQuotes(current) || undefined
  );
  const [hasChanged, setHasChanged] = useState(false);

  useEffect(() => {
    // this condition stops infinite loops on input clear when onChange is changing newColor in outer scope
    if (!newNameColor && onChange) return;
    const sanitized = stripQuotes(newNameColor || current);
    if (sanitized) setTempColor(sanitized);
    else setTempColor(undefined);
  }, [current, newNameColor, onChange]);

  useEffect(() => {
    setHasChanged(newNameColor !== current);
  }, [newNameColor, current]);

  // Valid in the sense that it should look like an error during input.
  // It's disruptive to the user to immediately present their input as an error.
  // We should only present an error if they fail the regex test :)
  // (Also this change makes the fallback "undefined" instead of #fff so this is required)
  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const validInput = (testColor: string | undefined) => {
    if (!testColor) return true;
    return isValidHex(testColor);
  };

  const handleUpdate = (newColor: string) => {
    let sanitized = stripQuotes(newColor);
    sanitized = sanitized.startsWith('#') ? sanitized : `#${sanitized}`;
    setTempColor(sanitized);
    const currentSanitized = stripQuotes(current) || '#ffffff';
    setHasChanged(sanitized.toUpperCase() !== currentSanitized.toUpperCase());
  };

  const handleSave = () => {
    if (!!onSave && !!tempColor && isValidHex(tempColor)) {
      onSave(tempColor);
      setHasChanged(false);
    }
  };

  const handleReset = () => {
    if (onChange) onChange(null);
    if (onSave) onSave(null);
    setHasChanged(false);
    setTempColor(undefined);
  };

  useEffect(() => {
    const validColor = tempColor !== undefined && isValidHex(tempColor);
    if (onChange) onChange(validColor ? tempColor : null);
  }, [onChange, tempColor]);

  return (
    <Box direction="Column" gap="100">
      <SettingTile
        title={title}
        focusId={focusId}
        description={description}
        after={
          <Box
            alignItems="Center"
            justifyContent="SpaceBetween"
            gap="300"
            style={{
              padding: config.space.S100,
              backgroundColor: color.Surface.Container,
              borderRadius: config.radii.R400,
            }}
          >
            <Box alignItems="Center" gap="300" grow="Yes">
              {onSave && hasChanged && (
                <Button
                  variant="Primary"
                  size="300"
                  radii="Pill"
                  onClick={handleSave}
                  disabled={!tempColor || !isValidHex(tempColor)}
                >
                  <Text size="B300">Save</Text>
                </Button>
              )}
              <HexColorPickerPopOut color={tempColor ?? '#FFFFFF'} onChange={handleUpdate}>
                {(onOpen, opened) => (
                  <Button
                    onClick={onOpen}
                    size="400"
                    variant="Secondary"
                    fill="None"
                    radii="300"
                    disabled={disabled ?? false}
                    style={{
                      padding: config.space.S100,
                      border: `2px solid ${opened ? 'var(--sable-primary-main)' : 'var(--sable-border-focus)'}`,
                    }}
                  >
                    <Box
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: tempColor ?? '#FFFFFF',
                        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                      }}
                    />
                  </Button>
                )}
              </HexColorPickerPopOut>

              <Box direction="Row" alignItems="Center" gap="100">
                <Input
                  value={tempColor ?? ''}
                  onChange={(e) => handleUpdate(e.currentTarget.value)}
                  placeholder="#FFFFFF"
                  variant={validInput(tempColor) ? 'Background' : 'Critical'}
                  size="300"
                  radii="300"
                  disabled={disabled ?? false}
                  style={{
                    textTransform: 'uppercase',
                    fontFamily: 'monospace',
                    width: '100px',
                  }}
                />
                {tempColor && (
                  <IconButton
                    variant="Secondary"
                    size="300"
                    radii="300"
                    disabled={disabled ?? false}
                    onClick={handleReset}
                    title="Reset to default"
                  >
                    {menuIcon(X)}
                  </IconButton>
                )}
              </Box>
            </Box>
          </Box>
        }
      />
    </Box>
  );
}
