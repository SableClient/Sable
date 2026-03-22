import { useCallback, useState } from 'react';
import { Box, Text, Button, MenuItem } from 'folds';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { CaretUpIcon } from '@phosphor-icons/react/dist/csr/CaretUp';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useAccountDataCallback } from '$hooks/useAccountDataCallback';
import { CutoutCard } from '$components/cutout-card';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { PhosphorIcon } from '$components/PhosphorIcon';

type AccountDataProps = {
  expand: boolean;
  onExpandToggle: (expand: boolean) => void;
  onSelect: (type: string | null) => void;
};
export function AccountData({ expand, onExpandToggle, onSelect }: AccountDataProps) {
  const mx = useMatrixClient();
  const [accountDataTypes, setAccountDataKeys] = useState<string[]>(() =>
    // TODO: tighten this once account data event typing is standardized.
    Array.from(mx.store.accountData.keys())
  );

  useAccountDataCallback(
    mx,
    useCallback(() => {
      // TODO: tighten this once account data event typing is standardized.
      setAccountDataKeys(Array.from(mx.store.accountData.keys()));
    }, [mx])
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Account Data</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Global"
          description="Data stored in your global account data."
          after={
            <Button
              onClick={() => onExpandToggle(!expand)}
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="300"
              outlined
              before={
                <PhosphorIcon as={expand ? CaretUpIcon : CaretDownIcon} size="100" weight="fill" />
              }
            >
              <Text size="B300">{expand ? 'Collapse' : 'Expand'}</Text>
            </Button>
          }
        />
        {expand && (
          <Box direction="Column" gap="100">
            <Box justifyContent="SpaceBetween">
              <Text size="L400">Events</Text>
              <Text size="L400">Total: {accountDataTypes.length}</Text>
            </Box>
            <CutoutCard>
              <MenuItem
                variant="Surface"
                fill="None"
                size="300"
                radii="0"
                before={<PhosphorIcon as={PlusIcon} size="50" />}
                onClick={() => onSelect(null)}
              >
                <Box grow="Yes">
                  <Text size="T200" truncate>
                    Add New
                  </Text>
                </Box>
              </MenuItem>
              {accountDataTypes.sort().map((type) => (
                <MenuItem
                  key={type}
                  variant="Surface"
                  fill="None"
                  size="300"
                  radii="0"
                  after={<PhosphorIcon as={CaretRightIcon} size="50" />}
                  onClick={() => onSelect(type)}
                >
                  <Box grow="Yes">
                    <Text size="T200" truncate>
                      {type}
                    </Text>
                  </Box>
                </MenuItem>
              ))}
            </CutoutCard>
          </Box>
        )}
      </SequenceCard>
    </Box>
  );
}
