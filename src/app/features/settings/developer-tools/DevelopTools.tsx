import { useCallback, useEffect, useState } from 'react';
import { Box, Text, Scroll, Switch, Button, Spinner, color } from 'folds';
import { KnownMembership } from '$types/matrix-sdk';
import { PageContent } from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { AccountDataSubmitCallback } from '$components/AccountDataEditor';
import { AccountDataEditor } from '$components/AccountDataEditor';
import {
  clearMediaCache,
  clearInMemoryBlobCache,
  getBlobCacheStats,
  getBlobCacheStatsAsync,
} from '$hooks/useBlobCache';
import {
  clearRenderableMediaUrlCache,
  getRenderableMediaUrlStats,
} from '$hooks/useRenderableMediaUrl';
import { copyToClipboard } from '$utils/dom';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import {
  clearProcessedAvatarCache,
  getProcessedAvatarCacheStats,
} from '$components/room-avatar/AvatarImage';
import { SettingsSectionPage } from '$features/settings/SettingsSectionPage';
import { AccountData } from './AccountData';
import { SyncDiagnostics } from './SyncDiagnostics';
import { ExperimentsPanel } from './ExperimentsPanel';
import { DebugLogViewer } from './DebugLogViewer';
import { SentrySettings } from './SentrySettings';
import { SearchIndexCache } from './SearchIndexCache';

const JOIN_MEMBERSHIP: string = KnownMembership.Join;
const SW_MEDIA_CACHE_NAME = 'sable-media-sw-v2';

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
  const [renderableCacheStats, setRenderableCacheStats] = useState(() =>
    getRenderableMediaUrlStats()
  );
  const [processedAvatarCacheStats, setProcessedAvatarCacheStats] = useState(() =>
    getProcessedAvatarCacheStats()
  );
  const [swCacheStats, setSwCacheStats] = useState({ count: 0, sizeMB: 0 });

  const refreshInMemoryCacheStats = useCallback(() => {
    setCacheStats(getBlobCacheStats());
    setRenderableCacheStats(getRenderableMediaUrlStats());
    setProcessedAvatarCacheStats(getProcessedAvatarCacheStats());
  }, []);

  const inMemoryCacheSize =
    cacheStats.cacheSize + renderableCacheStats.cacheSize + processedAvatarCacheStats.cacheSize;

  useEffect(() => {
    // Async-load persistent cache metadata (requires Cache API).
    getBlobCacheStatsAsync()
      .then(setCacheStats)
      .catch(() => undefined);
    // Read SW media cache from page context (same origin, shared with the SW)
    caches
      .open(SW_MEDIA_CACHE_NAME)
      .then(async (cache) => {
        const requests = await cache.keys();
        const responses = await Promise.all(requests.map((req) => cache.match(req)));
        const totalBytes = responses.reduce((sum, resp) => {
          if (!resp) return sum;
          const cl = resp.headers.get('content-length');
          return cl ? sum + parseInt(cl, 10) : sum;
        }, 0);
        setSwCacheStats({
          count: requests.length,
          sizeMB: totalBytes / (1024 * 1024),
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(refreshInMemoryCacheStats, 1500);
    return () => window.clearInterval(intervalId);
  }, [refreshInMemoryCacheStats]);

  const [clearCacheState, clearMediaCacheAction] = useAsyncCallback<void, Error, []>(
    useCallback(async () => {
      await clearMediaCache();
      clearRenderableMediaUrlCache();
      clearProcessedAvatarCache();
      setCacheStats(await getBlobCacheStatsAsync());
      setRenderableCacheStats(getRenderableMediaUrlStats());
      setProcessedAvatarCacheStats(getProcessedAvatarCacheStats());
    }, [])
  );

  const clearInMemoryAction = useCallback(() => {
    clearInMemoryBlobCache();
    clearRenderableMediaUrlCache();
    clearProcessedAvatarCache();
    refreshInMemoryCacheStats();
  }, [refreshInMemoryCacheStats]);

  const inMemoryCacheItemLabel = inMemoryCacheSize === 1 ? 'item' : 'items';
  const renderableCacheItemLabel = renderableCacheStats.cacheSize === 1 ? 'item' : 'items';
  const renderableInflightLabel = renderableCacheStats.inflightCount === 1 ? 'fetch' : 'fetches';
  const processedAvatarItemLabel = processedAvatarCacheStats.cacheSize === 1 ? 'avatar' : 'avatars';
  const legacyBlobItemLabel = cacheStats.cacheSize === 1 ? 'legacy blob' : 'legacy blobs';

  const inMemoryCacheDescription = `${inMemoryCacheSize} ${inMemoryCacheItemLabel} · ${renderableCacheStats.cacheSize} renderable ${renderableCacheItemLabel}, ${processedAvatarCacheStats.cacheSize} processed ${processedAvatarItemLabel}, ${cacheStats.cacheSize} ${legacyBlobItemLabel}, ${renderableCacheStats.inflightCount} active ${renderableInflightLabel} · cleared on reload`;

  const [clearSwCacheState, clearSwCacheAction] = useAsyncCallback<void, Error, []>(
    useCallback(async () => {
      await caches.delete(SW_MEDIA_CACHE_NAME);
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

  const deleteAccountData = useCallback(
    (type: string) => {
      if (
        !window.confirm(
          `Delete account data '${type}'?\n\nNote: Matrix does not support deleting account data events. This will overwrite the content with an empty object {}. The event type key will remain.`
        )
      )
        return;
      // as never: developer tools delete arbitrary account data types beyond the typed enum.
      mx.setAccountData(type as never, {} as never).then(() => setAccountDataType(undefined));
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
        onDelete={accountDataType ? () => deleteAccountData(accountDataType) : undefined}
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
              {developerTools && <ExperimentsPanel />}
              {developerTools && (
                <Box direction="Column" gap="100">
                  <Text size="L400">Encryption</Text>
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <SettingTile
                      focusId="rotate-encryption-sessions"
                      title="Rotate Encryption Sessions"
                      description="Discard current Megolm sessions and begin sharing new keys with all room members. Key delivery happens in the background — send a message in each affected room to confirm the bridge has received the new keys."
                      after={
                        <Button
                          onClick={rotateAllSessions}
                          variant="Secondary"
                          fill="Soft"
                          size="300"
                          radii="300"
                          outlined
                          disabled={rotateState.status === AsyncStatus.Loading}
                          before={
                            rotateState.status === AsyncStatus.Loading && (
                              <Spinner size="100" variant="Secondary" />
                            )
                          }
                        >
                          <Text size="B300">
                            {rotateState.status === AsyncStatus.Loading ? 'Rotating…' : 'Rotate'}
                          </Text>
                        </Button>
                      }
                    >
                      {rotateState.status === AsyncStatus.Success && (
                        <Text size="T200" style={{ color: color.Success.Main }}>
                          Sessions discarded for {rotateState.data.rotated} of{' '}
                          {rotateState.data.total} encrypted rooms. Key sharing is starting in the
                          background — send a message in an affected room to confirm delivery to
                          bridges.
                        </Text>
                      )}
                      {rotateState.status === AsyncStatus.Error && (
                        <Text size="T200" style={{ color: color.Critical.Main }}>
                          {rotateState.error.message}
                        </Text>
                      )}
                    </SettingTile>
                  </SequenceCard>
                </Box>
              )}
              {developerTools && (
                <Box direction="Column" gap="100">
                  <Text size="L400">Caches</Text>
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <SettingTile
                      focusId="clear-in-memory-cache"
                      title="In-Memory Media Cache"
                      description={inMemoryCacheDescription}
                      after={
                        <Button
                          onClick={clearInMemoryAction}
                          variant="Secondary"
                          fill="Soft"
                          size="300"
                          radii="300"
                          outlined
                        >
                          <Text size="B300">Clear</Text>
                        </Button>
                      }
                    />
                    <SettingTile
                      focusId="clear-sw-cache"
                      title="Service Worker Media Cache"
                      description={`${swCacheStats.count} ${swCacheStats.count === 1 ? 'file' : 'files'} · ${swCacheStats.sizeMB.toFixed(1)} MB · intercepted media requests served offline by the service worker`}
                      after={
                        <Button
                          onClick={clearSwCacheAction}
                          variant="Secondary"
                          fill="Soft"
                          size="300"
                          radii="300"
                          outlined
                          disabled={clearSwCacheState.status === AsyncStatus.Loading}
                          before={
                            clearSwCacheState.status === AsyncStatus.Loading && (
                              <Spinner size="100" variant="Secondary" />
                            )
                          }
                        >
                          <Text size="B300">
                            {clearSwCacheState.status === AsyncStatus.Loading
                              ? 'Clearing…'
                              : 'Clear'}
                          </Text>
                        </Button>
                      }
                    >
                      {clearSwCacheState.status === AsyncStatus.Success && (
                        <Text size="T200" style={{ color: color.Success.Main }}>
                          Service worker cache cleared.
                        </Text>
                      )}
                      {clearSwCacheState.status === AsyncStatus.Error && (
                        <Text size="T200" style={{ color: color.Critical.Main }}>
                          {clearSwCacheState.error.message}
                        </Text>
                      )}
                    </SettingTile>
                    <SettingTile
                      focusId="clear-media-cache"
                      title="Persistent Media Cache"
                      description={`${cacheStats.persistentCacheCount} ${cacheStats.persistentCacheCount === 1 ? 'file' : 'files'} · ${cacheStats.persistentCacheSizeMB.toFixed(1)} MB · authenticated media blobs for avatars, emoji, stickers, and attachments persisted between sessions`}
                      after={
                        <Button
                          onClick={clearMediaCacheAction}
                          variant="Secondary"
                          fill="Soft"
                          size="300"
                          radii="300"
                          outlined
                          disabled={clearCacheState.status === AsyncStatus.Loading}
                          before={
                            clearCacheState.status === AsyncStatus.Loading && (
                              <Spinner size="100" variant="Secondary" />
                            )
                          }
                        >
                          <Text size="B300">
                            {clearCacheState.status === AsyncStatus.Loading ? 'Clearing…' : 'Clear'}
                          </Text>
                        </Button>
                      }
                    >
                      {clearCacheState.status === AsyncStatus.Success && (
                        <Text size="T200" style={{ color: color.Success.Main }}>
                          Persistent cache cleared.
                        </Text>
                      )}
                      {clearCacheState.status === AsyncStatus.Error && (
                        <Text size="T200" style={{ color: color.Critical.Main }}>
                          {clearCacheState.error.message}
                        </Text>
                      )}
                    </SettingTile>
                    <SettingTile
                      focusId="matrix-store-cache"
                      title="Matrix Event Store"
                      description="Rooms, messages, and sync state — persisted in IndexedDB. To clear, use About → Clear Cache &amp; Reload."
                    />
                  </SequenceCard>
                </Box>
              )}
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
              {developerTools && <SearchIndexCache />}
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
