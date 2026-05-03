import type { ChangeEventHandler, FormEventHandler } from 'react';
import { useEffect, useState } from 'react';
import { Box, Text, Button, Input, IconButton, Icon, Icons, Spinner, config } from 'folds';
import { SettingTile } from '$components/setting-tile';

type StatusEditorProps = {
  current?: string;
  onSave: (status: string) => Promise<void>;
};

export function StatusEditor({ current = '', onSave }: StatusEditorProps) {
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setValue(current);
  }, [current]);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    setValue(evt.currentTarget.value);
  };

  const handleReset = () => {
    setValue(current);
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (evt) => {
    evt.preventDefault();
    if (saving) return;

    if (value === current) return;

    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = value !== current;

  return (
    <SettingTile title="Status" focusId="status">
      <Box direction="Column" grow="Yes" gap="100">
        <Box as="form" onSubmit={handleSubmit} gap="200" aria-disabled={saving} grow="Yes">
          <Box grow="Yes" direction="Column">
            <Input
              name="statusInput"
              value={value}
              onChange={handleChange}
              placeholder="What's on your mind?"
              variant="Secondary"
              radii="300"
              style={{ paddingRight: config.space.S200 }}
              readOnly={saving}
              after={
                hasChanges &&
                !saving && (
                  <IconButton
                    type="reset"
                    onClick={handleReset}
                    size="300"
                    radii="300"
                    variant="Secondary"
                  >
                    <Icon src={Icons.Cross} size="100" />
                  </IconButton>
                )
              }
            />
          </Box>
          <Button
            size="400"
            variant={hasChanges ? 'Success' : 'Secondary'}
            fill={hasChanges ? 'Solid' : 'Soft'}
            outlined
            radii="300"
            disabled={!hasChanges || saving}
            type="submit"
          >
            {saving && <Spinner variant="Success" fill="Solid" size="300" />}
            <Text size="B400">Save</Text>
          </Button>
        </Box>
      </Box>
    </SettingTile>
  );
}
