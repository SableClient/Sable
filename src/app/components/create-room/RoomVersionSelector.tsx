import type { MouseEventHandler } from 'react';
import { Box, Button, Chip, config, Menu, Text, toRem } from 'folds';
import { CaretDown, CaretUp, sizedIcon } from '$components/icons/phosphor';
import { ResponsiveMenu } from '$components/ResponsiveMenu';
import { useMenuAnchor } from '$hooks/useMenuAnchor';
import { SettingTile } from '$components/setting-tile';
import { SequenceCard } from '$components/sequence-card';

export function RoomVersionSelector({
  versions,
  value,
  onChange,
  disabled,
}: {
  versions: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const menuAnchor = useMenuAnchor<HTMLButtonElement>();

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    menuAnchor.openAt(evt.currentTarget);
  };

  const handleSelect = (version: string) => {
    menuAnchor.close();
    onChange(version);
  };

  return (
    <SequenceCard
      style={{ padding: config.space.S300 }}
      variant="SurfaceVariant"
      direction="Column"
      gap="500"
    >
      <SettingTile
        title="Version"
        after={
          <ResponsiveMenu
            anchor={menuAnchor.anchor}
            requestClose={menuAnchor.close}
            offset={5}
            position="Bottom"
            align="End"
            mobile="dialog"
            menu={
              <Menu>
                <Box
                  direction="Column"
                  gap="200"
                  style={{ padding: config.space.S200, maxWidth: toRem(300) }}
                >
                  <Text size="L400">Versions</Text>
                  <Box wrap="Wrap" gap="100">
                    {versions.map((version) => (
                      <Chip
                        key={version}
                        variant={value === version ? 'Primary' : 'SurfaceVariant'}
                        aria-pressed={value === version}
                        outlined={value === version}
                        radii="300"
                        onClick={() => handleSelect(version)}
                        type="button"
                      >
                        <Text truncate size="T300">
                          {version}
                        </Text>
                      </Chip>
                    ))}
                  </Box>
                </Box>
              </Menu>
            }
          >
            <Button
              type="button"
              onClick={handleMenu}
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              aria-pressed={!!menuAnchor.anchor}
              before={sizedIcon(menuAnchor.anchor ? CaretUp : CaretDown, '50')}
              disabled={disabled}
            >
              <Text size="B300">{value}</Text>
            </Button>
          </ResponsiveMenu>
        }
      />
    </SequenceCard>
  );
}
