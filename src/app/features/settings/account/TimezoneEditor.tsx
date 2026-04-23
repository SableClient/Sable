import type { ChangeEvent } from 'react';
import { useMemo, useState, useEffect } from 'react';
import { Box, IconButton, Button, Icon, Icons, Input, Text } from 'folds';
import { SettingTile } from '$components/setting-tile';

interface IntlWithSupportedValues {
  supportedValuesOf(key: 'timeZone' | (string & {})): string[];
}

type TimezoneEditorProps = {
  current?: string;
  onSave: (tz: string) => void;
};

export function TimezoneEditor({ current, onSave }: TimezoneEditorProps) {
  const [val, setVal] = useState(current ?? '');
  const zones = useMemo(() => {
    const intlPolyfill = Intl as unknown as IntlWithSupportedValues;
    return intlPolyfill.supportedValuesOf('timeZone');
  }, []);

  useEffect(() => setVal(current ?? ''), [current]);

  const handleSync = () => {
    const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setVal(systemTz);
    onSave(systemTz);
  };

  const handleReset = () => {
    setVal('');
    onSave('');
  };

  const handleManualSave = () => {
    const trimmed = val.trim().slice(0, 64);
    const matchedZone = zones.find((z) => z.toLowerCase() === trimmed.toLowerCase());
    if (matchedZone && matchedZone !== current) {
      onSave(matchedZone);
      setVal(matchedZone);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setVal(e.currentTarget.value);
  };

  return (
    <SettingTile
      title="Timezone"
      focusId="timezone"
      description="Set manually or sync with your system."
      after={
        <Box gap="200" alignItems="Center">
          <Input
            list="tz-list"
            value={val}
            size="300"
            radii="300"
            variant="Secondary"
            placeholder="e.g. Europe/London"
            onChange={handleChange}
            onBlur={handleManualSave}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSave()}
            style={{ width: '180px' }}
          />
          <datalist id="tz-list">
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </datalist>
          <Button
            variant="Secondary"
            fill="Soft"
            size="300"
            radii="300"
            outlined
            onClick={handleSync}
          >
            <Text size="B300">System</Text>
          </Button>
          <IconButton
            size="300"
            variant="Critical"
            fill="None"
            onClick={handleReset}
            radii="300"
            title="Reset"
          >
            <Icon src={Icons.Cross} size="100" />
          </IconButton>
        </Box>
      }
    />
  );
}
