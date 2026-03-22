import { ChangeEventHandler, FormEventHandler, useEffect, useState } from 'react';
import { Box, Text, Button, Input, IconButton, Spinner, config } from 'folds';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { SettingTile } from '$components/setting-tile';
import { PhosphorIcon } from '$components/PhosphorIcon';

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
    <SettingTile title="Status">
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
                    <PhosphorIcon as={XIcon} size="100" />
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
