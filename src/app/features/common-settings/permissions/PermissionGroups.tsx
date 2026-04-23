import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Box, Button, Chip, config, Icon, Icons, Menu, Spinner, Text } from 'folds';
import { produce } from 'immer';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import type { IPowerLevels, PermissionLocation } from '$hooks/usePowerLevels';
import { applyPermissionPower, getPermissionPower } from '$hooks/usePowerLevels';
import { getPowerLevelTag, getPowers, usePowerLevelTags } from '$hooks/usePowerLevelTags';
import { useRoom } from '$hooks/useRoom';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { StateEvents } from '$types/matrix-sdk';

import { PowerSwitcher } from '$components/power';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useAlive } from '$hooks/useAlive';
import { SequenceCardStyle } from '$features/common-settings/styles.css';
import type { PermissionGroup } from './types';
import { EventType } from '$types/matrix-sdk';

const USER_DEFAULT_LOCATION: PermissionLocation = {
  user: true,
};

type PermissionGroupsProps = {
  canEdit: boolean;
  powerLevels: IPowerLevels;
  permissionGroups: PermissionGroup[];
};

const getPermissionLocationKey = (location: PermissionLocation): string => JSON.stringify(location);

export function PermissionGroups({
  powerLevels,
  permissionGroups,
  canEdit,
}: PermissionGroupsProps) {
  const mx = useMatrixClient();
  const room = useRoom();
  const alive = useAlive();

  const powerLevelTags = usePowerLevelTags(room, powerLevels);
  const maxPower = useMemo(() => Math.max(...getPowers(powerLevelTags)), [powerLevelTags]);

  const [permissionUpdate, setPermissionUpdate] = useState<Map<PermissionLocation, number>>(
    new Map()
  );

  useEffect(() => {
    // reset permission update if component rerender
    // as permission location object reference has changed
    setPermissionUpdate(new Map());
  }, [permissionGroups]);

  const handleChangePermission = (
    location: PermissionLocation,
    newPower: number,
    currentPower: number
  ) => {
    setPermissionUpdate((p) => {
      const up: typeof p = new Map();
      p.forEach((value, key) => {
        up.set(key, value);
      });
      if (newPower === currentPower) {
        up.delete(location);
      } else {
        up.set(location, newPower);
      }
      return up;
    });
  };

  const [applyState, applyChanges] = useAsyncCallback(
    useCallback(async () => {
      const editedPowerLevels = produce(powerLevels, (draftPowerLevels) => {
        permissionGroups.forEach((group) =>
          group.items.forEach((item) => {
            const power = getPermissionPower(powerLevels, item.location);
            applyPermissionPower(draftPowerLevels, item.location, power);
          })
        );
        permissionUpdate.forEach((power, location) =>
          applyPermissionPower(draftPowerLevels, location, power)
        );

        return draftPowerLevels;
      });
      await mx.sendStateEvent(
        room.roomId,
        EventType.RoomPowerLevels as keyof StateEvents,
        editedPowerLevels
      );
    }, [mx, room, powerLevels, permissionUpdate, permissionGroups])
  );

  const resetChanges = useCallback(() => {
    setPermissionUpdate(new Map());
  }, []);

  const handleApplyChanges = () => {
    applyChanges().then(() => {
      if (alive()) {
        resetChanges();
      }
    });
  };

  const applyingChanges = applyState.status === AsyncStatus.Loading;
  const hasChanges = permissionUpdate.size > 0;

  const renderUserGroup = () => {
    const power = getPermissionPower(powerLevels, USER_DEFAULT_LOCATION);
    const powerUpdate = permissionUpdate.get(USER_DEFAULT_LOCATION);
    const value = powerUpdate ?? power;

    const tag = getPowerLevelTag(powerLevelTags, value);
    const powerChanges = value !== power;

    return (
      <Box direction="Column" gap="100">
        <Text size="L400">Users</Text>
        <SequenceCard
          variant="SurfaceVariant"
          className={SequenceCardStyle}
          direction="Column"
          gap="400"
        >
          <SettingTile
            title="Default Power"
            description="Default power level for all users."
            after={
              <PowerSwitcher
                powerLevelTags={powerLevelTags}
                value={value}
                onChange={(v) => handleChangePermission(USER_DEFAULT_LOCATION, v, power)}
              >
                {(handleOpen, opened) => (
                  <Chip
                    variant={powerChanges ? 'Success' : 'Secondary'}
                    outlined={powerChanges}
                    fill="Soft"
                    radii="Pill"
                    aria-selected={opened}
                    disabled={!canEdit || applyingChanges}
                    after={
                      powerChanges && (
                        <Badge size="200" variant="Success" fill="Solid" radii="Pill" />
                      )
                    }
                    before={
                      canEdit && (
                        <Icon size="50" src={opened ? Icons.ChevronTop : Icons.ChevronBottom} />
                      )
                    }
                    onClick={handleOpen}
                  >
                    <Text size="B300" truncate>
                      {tag.name}
                    </Text>
                  </Chip>
                )}
              </PowerSwitcher>
            }
          />
        </SequenceCard>
      </Box>
    );
  };

  return (
    <>
      {renderUserGroup()}
      {permissionGroups.map((group) => (
        <Box key={group.name} direction="Column" gap="100">
          <Text size="L400">{group.name}</Text>
          {group.items.map((item) => {
            const power = getPermissionPower(powerLevels, item.location);
            const powerUpdate = permissionUpdate.get(item.location);
            const value = powerUpdate ?? power;

            const tag = getPowerLevelTag(powerLevelTags, value);
            const powerChanges = value !== power;

            return (
              <SequenceCard
                key={getPermissionLocationKey(item.location)}
                variant="SurfaceVariant"
                className={SequenceCardStyle}
                direction="Column"
                gap="400"
              >
                <SettingTile
                  title={item.name}
                  description={item.description}
                  after={
                    <PowerSwitcher
                      powerLevelTags={powerLevelTags}
                      value={value}
                      onChange={(v) => handleChangePermission(item.location, v, power)}
                    >
                      {(handleOpen, opened) => (
                        <Chip
                          variant={powerChanges ? 'Success' : 'Secondary'}
                          outlined={powerChanges}
                          fill="Soft"
                          radii="Pill"
                          aria-selected={opened}
                          disabled={!canEdit || applyingChanges}
                          after={
                            powerChanges && (
                              <Badge size="200" variant="Success" fill="Solid" radii="Pill" />
                            )
                          }
                          before={
                            canEdit && (
                              <Icon
                                size="50"
                                src={opened ? Icons.ChevronTop : Icons.ChevronBottom}
                              />
                            )
                          }
                          onClick={handleOpen}
                        >
                          <Text size="B300" truncate>
                            {tag.name}
                          </Text>
                          {value < maxPower && <Text size="T200">& Above</Text>}
                        </Chip>
                      )}
                    </PowerSwitcher>
                  }
                />
              </SequenceCard>
            );
          })}
        </Box>
      ))}

      {hasChanges && (
        <Menu
          style={{
            position: 'sticky',
            padding: config.space.S200,
            paddingLeft: config.space.S400,
            bottom: config.space.S400,
            left: config.space.S400,
            right: 0,
            zIndex: 1,
          }}
          variant="Success"
        >
          <Box alignItems="Center" gap="400">
            <Box grow="Yes" direction="Column">
              {applyState.status === AsyncStatus.Error ? (
                <Text size="T200">
                  <b>Failed to apply changes! Please try again.</b>
                </Text>
              ) : (
                <Text size="T200">
                  <b>Changes saved! Apply when ready.</b>
                </Text>
              )}
            </Box>
            <Box shrink="No" gap="200">
              <Button
                size="300"
                variant="Success"
                fill="None"
                radii="300"
                disabled={applyingChanges}
                onClick={resetChanges}
              >
                <Text size="B300">Reset</Text>
              </Button>
              <Button
                size="300"
                variant="Success"
                radii="300"
                disabled={applyingChanges}
                before={applyingChanges && <Spinner variant="Success" fill="Solid" size="100" />}
                onClick={handleApplyChanges}
              >
                <Text size="B300">Apply Changes</Text>
              </Button>
            </Box>
          </Box>
        </Menu>
      )}
    </>
  );
}
