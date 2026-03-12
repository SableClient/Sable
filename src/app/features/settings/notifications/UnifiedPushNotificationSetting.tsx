/* eslint-disable no-nested-ternary */
import { MouseEventHandler, useEffect, useState } from 'react';
import { Text, Switch, Spinner, Button, color, Menu, PopOut, MenuItem, RectCords } from 'folds';
import FocusTrap from 'focus-trap-react';
import { useAtom } from 'jotai';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useClientConfig } from '$hooks/useClientConfig';
import { unifiedPushEndpointAtom } from '$state/unifiedPushEndpoint';
import { stopPropagation } from '$utils/keyboard';
import {
  enableUnifiedPush,
  disableUnifiedPush,
  getUnifiedPushDistributors,
  getUnifiedPushDistributor,
  saveUnifiedPushDistributor,
} from './UnifiedPushNotifications';

export default function UnifiedPushNotificationSetting() {
  const mx = useMatrixClient();
  const clientConfig = useClientConfig();
  const [useUP, setUseUP] = useSetting(settingsAtom, 'useUnifiedPush');
  const [upEndpoint, setUpEndpoint] = useAtom(unifiedPushEndpointAtom);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [distributors, setDistributors] = useState<string[]>([]);
  const [currentDistributor, setCurrentDistributor] = useState<string>('');
  const [menuCords, setMenuCords] = useState<RectCords>();

  useEffect(() => {
    Promise.all([
      getUnifiedPushDistributors().catch(() => ({ distributors: [] as string[] })),
      getUnifiedPushDistributor().catch(() => ({ distributor: '' })),
    ]).then(async ([distResult, savedResult]) => {
      setDistributors(distResult.distributors);
      setCurrentDistributor(savedResult.distributor);

      // Auto-save the only available distributor when none is saved yet.
      // UP connector 3.x requires an explicit selection before register() works.
      if (!savedResult.distributor && distResult.distributors.length === 1) {
        await saveUnifiedPushDistributor(distResult.distributors[0]);
        setCurrentDistributor(distResult.distributors[0]);
      }
    });
  }, []);

  const handleToggle = async (wantsUP: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      if (wantsUP) {
        if (!currentDistributor && distributors.length > 0) {
          await saveUnifiedPushDistributor(distributors[0]);
          setCurrentDistributor(distributors[0]);
        }

        const result = await enableUnifiedPush(mx, clientConfig);
        setUpEndpoint(result);
        setUseUP(true);
      } else {
        await disableUnifiedPush(mx, clientConfig, upEndpoint?.endpoint);
        setUpEndpoint(null);
        setUseUP(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('UnifiedPush toggle failed:', e);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectDistributor = async (distributor: string) => {
    setMenuCords(undefined);
    if (distributor === currentDistributor) return;
    setIsLoading(true);
    try {
      if (useUP) {
        await disableUnifiedPush(mx, clientConfig, upEndpoint?.endpoint);
      }
      await saveUnifiedPushDistributor(distributor);
      setCurrentDistributor(distributor);
      if (useUP) {
        const result = await enableUnifiedPush(mx, clientConfig);
        setUpEndpoint(result);
      }
    } catch (e) {
      console.error('Distributor switch failed:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const distributorLabel = (pkg: string) => {
    const parts = pkg.split('.');
    return parts[parts.length - 1] ?? pkg;
  };

  const handleDistributorMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <>
      <SettingTile
        title="UnifiedPush Notifications"
        description={
          error ? (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              {error}
            </Text>
          ) : distributors.length === 0 ? (
            <Text as="span" style={{ color: color.Warning.Main }} size="T200">
              No UnifiedPush distributor installed. Install one (e.g. ntfy, NextPush) to use this
              feature.
            </Text>
          ) : (
            'Receive background notifications via UnifiedPush without Google Services.'
          )
        }
        after={
          isLoading ? (
            <Spinner variant="Secondary" />
          ) : (
            <Switch value={useUP} onChange={handleToggle} disabled={distributors.length === 0} />
          )
        }
      />
      {distributors.length > 1 && (
        <SettingTile
          title="Distributor"
          description={currentDistributor ? distributorLabel(currentDistributor) : 'Not selected'}
          after={
            <>
              <PopOut
                anchor={menuCords}
                position="Bottom"
                align="End"
                content={
                  <FocusTrap
                    focusTrapOptions={{
                      initialFocus: false,
                      onDeactivate: () => setMenuCords(undefined),
                      clickOutsideDeactivates: true,
                      escapeDeactivates: stopPropagation,
                    }}
                  >
                    <Menu>
                      {distributors.map((d) => (
                        <MenuItem
                          key={d}
                          radii="300"
                          onClick={() => handleSelectDistributor(d)}
                          aria-pressed={d === currentDistributor}
                        >
                          <Text size="B300">{distributorLabel(d)}</Text>
                        </MenuItem>
                      ))}
                    </Menu>
                  </FocusTrap>
                }
              />
              <Button
                size="300"
                radii="300"
                variant="Secondary"
                fill="Soft"
                onClick={handleDistributorMenu}
              >
                <Text size="B300">Change</Text>
              </Button>
            </>
          }
        />
      )}
    </>
  );
}
