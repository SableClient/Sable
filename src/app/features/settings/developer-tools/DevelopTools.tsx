import { useCallback, useState } from 'react';
import { Box, Text, Scroll, Switch, Button } from 'folds';
import { PageContent } from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { AccountDataSubmitCallback } from '$components/AccountDataEditor';
import { AccountDataEditor } from '$components/AccountDataEditor';
import { copyToClipboard } from '$utils/dom';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { SettingsSectionPage } from '../SettingsSectionPage';
import { AccountData } from './AccountData';
import { SyncDiagnostics } from './SyncDiagnostics';
import { DebugLogViewer } from './DebugLogViewer';
import { SentrySettings } from './SentrySettings';

type DeveloperToolsProps = {
  requestBack?: () => void;
  requestClose: () => void;
};
export function DeveloperTools({ requestBack, requestClose }: DeveloperToolsProps) {
  const mx = useMatrixClient();
  const [developerTools, setDeveloperTools] = useSetting(settingsAtom, 'developerTools');
  const [expand, setExpend] = useState(false);
  const [accountDataType, setAccountDataType] = useState<string | null>();
  const [cacheStats, setCacheStats] = useState(() => getBlobCacheStats());
  const [svgCacheSize, setSvgCacheSize] = useState(0);
  const [swCacheStats, setSwCacheStats] = useState({ count: 0, sizeMB: 0 });

  useEffect(() => {
    // Async-load persistent cache metadata (requires Cache API) and SVG cache size
    getBlobCacheStatsAsync()
      .then(setCacheStats)
      .catch(() => undefined);
    setSvgCacheSize(getSvgCacheSize());
    // Read SW media cache from page context (same origin, shared with the SW)
    caches
      .open('sable-media-sw-v1')
      .then(async (cache) => {
        const requests = await cache.keys();
        const responses = await Promise.all(requests.map((req) => cache.match(req)));
        const totalBytes = responses.reduce((sum, resp) => {
          if (!resp) return sum;
          const cl = resp.headers.get('content-length');
          return cl ? sum + parseInt(cl, 10) : sum;
        }, 0);
        setSwCacheStats({ count: requests.length, sizeMB: totalBytes / (1024 * 1024) });
      })
      .catch(() => undefined);
  }, []);

  const [clearCacheState, clearMediaCacheAction] = useAsyncCallback<void, Error, []>(
    useCallback(async () => {
      await clearMediaCache();
      setCacheStats(getBlobCacheStats());
    }, [])
  );

  const clearInMemoryAction = useCallback(() => {
    clearInMemoryBlobCache();
    setCacheStats(getBlobCacheStats());
  }, []);

  const clearSvgCacheAction = useCallback(() => {
    clearSvgBlobCache();
    setSvgCacheSize(getSvgCacheSize());
  }, []);

  const [clearSwCacheState, clearSwCacheAction] = useAsyncCallback<void, Error, []>(
    useCallback(async () => {
      await caches.delete('sable-media-sw-v1');
      setSwCacheStats({ count: 0, sizeMB: 0 });
    }, [])
  );

  const [rotateState, rotateAllSessions] = useAsyncCallback<
    { rotated: number; total: number },
    Error,
    []
  >(
    useCallback(async () => {
      if (
        !window.confirm(
          'This will discard all current Megolm encryption sessions and start new ones. Continue?'
        )
      ) {
        throw new Error('Cancelled');
      }

      const crypto = mx.getCrypto();
      if (!crypto) throw new Error('Crypto module not available');

      const encryptedRooms = mx
        .getRooms()
        .filter(
          (room) => room.getMyMembership() === JOIN_MEMBERSHIP && mx.isRoomEncrypted(room.roomId)
        );

      const results = await Promise.allSettled(
        encryptedRooms.map((room) => crypto.forceDiscardSession(room.roomId))
      );
      const rotated = results.filter((r) => r.status === 'fulfilled').length;

      // Proactively start session creation + key sharing with all devices
      // (including bridge bots). fire-and-forget per room, but surface failures.
      encryptedRooms.forEach((room) => {
        Promise.resolve()
          .then(() => crypto.prepareToEncrypt(room))
          .catch((error) => {
            console.error('[DevelopTools] Failed to prepare room encryption', room.roomId, error);
          });
      });

      return { rotated, total: encryptedRooms.length };
    }, [mx])
  );

  const submitAccountData: AccountDataSubmitCallback = useCallback(
    async (type, content) => {
      // TODO: remove cast once account data typing is unified.
      await mx.setAccountData(type as never, content as never);
    },
    [mx]
  );

  if (accountDataType !== undefined) {
    return (
      <AccountDataEditor
        type={accountDataType ?? undefined}
        content={
          accountDataType
            ? // TODO: remove cast once account data typing is unified.
              mx.getAccountData(accountDataType as never)?.getContent()
            : undefined
        }
        submitChange={submitAccountData}
        requestClose={() => setAccountDataType(undefined)}
      />
    );
  }

  return (
    <SettingsSectionPage
      title="Developer Tools"
      requestBack={requestBack}
      requestClose={requestClose}
    >
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Box direction="Column" gap="100">
                <Text size="L400">Options</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Enable Developer Tools"
                    focusId="enable-developer-tools"
                    after={
                      <Switch
                        variant="Primary"
                        value={developerTools}
                        onChange={setDeveloperTools}
                      />
                    }
                  />
                </SequenceCard>
                {developerTools && (
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <SettingTile
                      title="Access Token"
                      focusId="access-token"
                      description="Copy access token to clipboard."
                      after={
                        <Button
                          onClick={() =>
                            copyToClipboard(mx.getAccessToken() ?? '<NO_ACCESS_TOKEN_FOUND>')
                          }
                          variant="Secondary"
                          fill="Soft"
                          size="300"
                          radii="300"
                          outlined
                        >
                          <Text size="B300">Copy</Text>
                        </Button>
                      }
                    />
                  </SequenceCard>
                )}
              </Box>
              {developerTools && <SyncDiagnostics />}
              {developerTools && (
                <AccountData
                  expand={expand}
                  onExpandToggle={setExpend}
                  onSelect={setAccountDataType}
                />
              )}
              {developerTools && (
                <Box direction="Column" gap="100">
                  <DebugLogViewer />
                </Box>
              )}
              {developerTools && (
                <Box direction="Column" gap="100">
                  <SentrySettings />
                </Box>
              )}
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
