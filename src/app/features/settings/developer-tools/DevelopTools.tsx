import { useCallback, useState } from 'react';
import { Box, Text, IconButton, Icon, Icons, Scroll, Switch, Button, Spinner, color } from 'folds';
import { KnownMembership } from 'matrix-js-sdk/lib/types';
import { Page, PageContent, PageHeader } from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { AccountDataEditor, AccountDataSubmitCallback } from '$components/AccountDataEditor';
import { copyToClipboard } from '$utils/dom';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { AccountData } from './AccountData';
import { SyncDiagnostics } from './SyncDiagnostics';
import { DebugLogViewer } from './DebugLogViewer';
import { SentrySettings } from './SentrySettings';

type DeveloperToolsProps = {
  requestClose: () => void;
};
export function DeveloperTools({ requestClose }: DeveloperToolsProps) {
  const mx = useMatrixClient();
  const [developerTools, setDeveloperTools] = useSetting(settingsAtom, 'developerTools');
  const [expand, setExpend] = useState(false);
  const [accountDataType, setAccountDataType] = useState<string | null>();

  const [rotateState, rotateAllSessions] = useAsyncCallback<
    { rotated: number; total: number },
    Error,
    []
  >(
    useCallback(async () => {
      const crypto = mx.getCrypto();
      if (!crypto) throw new Error('Crypto module not available');

      const encryptedRooms = mx
        .getRooms()
        .filter(
          (room) =>
            room.getMyMembership() === KnownMembership.Join && mx.isRoomEncrypted(room.roomId)
        );

      await Promise.all(encryptedRooms.map((room) => crypto.forceDiscardSession(room.roomId)));
      const rotated = encryptedRooms.length;

      // Proactively start session creation + key sharing with all devices
      // (including bridge bots). fire-and-forget per room.
      encryptedRooms.forEach((room) => crypto.prepareToEncrypt(room));

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
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Developer Tools
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
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
                <Box direction="Column" gap="100">
                  <Text size="L400">Encryption</Text>
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <SettingTile
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
    </Page>
  );
}
