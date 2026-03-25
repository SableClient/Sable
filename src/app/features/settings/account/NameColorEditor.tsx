import { useState, useEffect } from 'react';
import { Box, Button, config, Text, Input, IconButton, Icon, Icons } from 'folds';
import { HexColorPicker } from 'react-colorful';
import { SettingTile } from '$components/setting-tile';
import { HexColorPickerPopOut } from '$components/HexColorPickerPopOut';

type NameColorEditorProps = {
  title: string;
  description?: string;
  current?: string;
  onSave: (color: string | null) => void;
  disabled?: boolean;
};

export function NameColorEditor({
  title,
  description,
  current,
  onSave,
  disabled,
}: Readonly<NameColorEditorProps>) {
  const stripQuotes = (str?: string) => {
    if (!str) return '';
    // to solve the silly tuwunel
    return str.replaceAll(/^["']|["']$/g, '');
  };

  const [tempColor, setTempColor] = useState(stripQuotes(current) || '#FFFFFF');
  const [hasChanged, setHasChanged] = useState(false);

  useEffect(() => {
    const sanitized = stripQuotes(current);
    if (sanitized) setTempColor(sanitized);
    else setTempColor('#FFFFFF');
  }, [current]);

  const handleUpdate = (newColor: string) => {
    let sanitized = stripQuotes(newColor);
    sanitized = sanitized.startsWith('#') ? sanitized : `#${sanitized}`;
    setTempColor(sanitized);
    const currentSanitized = stripQuotes(current) || '#FFFFFF';
    setHasChanged(sanitized.toUpperCase() !== currentSanitized.toUpperCase());
  };

  const handleSave = () => {
    if (/^#[0-9A-F]{6}$/i.test(tempColor)) {
      onSave(tempColor);
      setHasChanged(false);
    }
  };

  const handleReset = () => {
    onSave(null);
    setHasChanged(false);
    setTempColor('#FFFFFF');
  };

  return (
    <Box direction="Column" gap="100">
      <SettingTile title={title} description={description} />
      <Box
        alignItems="Center"
        justifyContent="SpaceBetween"
        gap="300"
        style={{
          padding: config.space.S400,
          backgroundColor: 'var(--sable-surface-container)',
          borderRadius: config.radii.R400,
        }}
      >
        <Box alignItems="Center" gap="300" grow="Yes">
          <HexColorPickerPopOut
            picker={<HexColorPicker color={tempColor} onChange={handleUpdate} />}
          >
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
                    backgroundColor: tempColor,
                    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                  }}
                />
              </Button>
            )}
          </HexColorPickerPopOut>

          <Box direction="Row" alignItems="Center" gap="100">
            <Input
              value={tempColor}
              onChange={(e) => handleUpdate(e.currentTarget.value)}
              placeholder="#FFFFFF"
              variant="Background"
              size="300"
              radii="300"
              disabled={disabled ?? false}
              style={{
                textTransform: 'uppercase',
                fontFamily: 'monospace',
                width: '100px',
              }}
            />
            {current && (
              <IconButton
                variant="Secondary"
                size="300"
                radii="300"
                disabled={disabled ?? false}
                onClick={handleReset}
                title="Reset to default"
              >
                <Icon src={Icons.Cross} size="100" />
              </IconButton>
            )}
          </Box>
        </Box>

        {hasChanged && (
          <Button
            variant="Primary"
            size="300"
            radii="Pill"
            onClick={handleSave}
            disabled={!/^#[0-9A-F]{6}$/i.test(tempColor)}
          >
            <Text size="B300">Save</Text>
          </Button>
        )}
      </Box>
    </Box>
  );
}
