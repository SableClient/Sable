import { useMatrixClient } from '$hooks/useMatrixClient';
import type { PerMessageProfileMsc4461, Persona } from '$hooks/usePerMessageProfile';
import {
  addOrUpdatePerMessageProfile,
  getAllPerMessageProfiles,
  getPerMessageProfileById,
  ProfileCatalog,
} from '$hooks/usePerMessageProfile';
import { isPersonaAccountDataEvent } from '$app/persona/catalog';
import { useAccountDataCallback } from '$hooks/useAccountDataCallback';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, color, config, Dialog, Header, Spinner, Switch, Text } from 'folds';
import { generateShortId } from '$utils/shortIdGen';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { PerMessageProfileListItem } from './PerMessageProfileListItem';
import { SettingTile } from '$components/setting-tile';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import {
  MATRIX_UNSTABLE_COLORS,
  MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME,
} from '$unstable/prefixes';
import { downloadJsonFile } from '$app/utils/download';
import { selectFile } from '$app/utils/dom';
import { ModalOverlay } from '$components/modal-overlay/ModalOverlay';
import { AsyncError } from '$components/AsyncError';
import {
  importPluralkitMembers,
  type PerMessageProfilePluralkitFormat,
  type PkImportOptions,
} from '$app/persona/pluralkit';
import { readFileToString } from '$app/utils/file';

type PerMessageProfileOverviewProps = {
  onCreateProfile: (profile: PerMessageProfileMsc4461) => void;
  onEditProfile: (profile: PerMessageProfileMsc4461) => void;
};
/**
 * Renders a list of per-message profiles along with an editor.
 * @returns rendering of per message profile list including editor
 */
export function PerMessageProfileOverview({
  onCreateProfile,
  onEditProfile,
}: PerMessageProfileOverviewProps) {
  const mx = useMatrixClient();
  const [profiles, setProfiles] = useState<PerMessageProfileMsc4461[]>([]);

  const [confirmWipeData, setConfirmWipeData] = useState(false);
  const [confirmPkImport, setConfirmPkImport] = useState(false);
  const [pkImportSettings, setPkImportSettings] = useState<PkImportOptions | null>(null);

  useEffect(() => {
    const fetchProfiles = async () => {
      const fetchedProfiles = await getAllPerMessageProfiles(mx);
      setProfiles(fetchedProfiles);
    };
    fetchProfiles();
  }, [mx]);

  useAccountDataCallback(
    mx,
    useCallback(
      (event) => {
        if (!isPersonaAccountDataEvent(event.getType())) return;
        void getAllPerMessageProfiles(mx).then(setProfiles);
      },
      [mx]
    )
  );

  const handleEdit = async (profileId: string) => {
    const profile = await getPerMessageProfileById(mx, profileId);
    if (profile) onEditProfile(profile);
  };

  const [addState, handleAdd] = useAsyncCallback(
    useCallback(async () => {
      const newProfile: PerMessageProfileMsc4461 = {
        id: generateShortId(5),
        displayname: 'New Profile',
        triggers: [],
      };
      await addOrUpdatePerMessageProfile(mx, newProfile);
      onCreateProfile(newProfile);
    }, [mx, onCreateProfile])
  );

  const [handlePkitImportState, handlePkitImport] = useAsyncCallback<void, Error, []>(
    useCallback(async () => {
      const file = await selectFile('application/json', false);
      if (!file) throw new Error('No file provided');

      const text = await readFileToString(file);
      const { members }: { members: PerMessageProfilePluralkitFormat[] } = JSON.parse(text);
      if (!members) throw new Error('Personas not found in file');

      const catalog = new ProfileCatalog(mx);
      await importPluralkitMembers(mx, catalog, members, pkImportSettings ?? {});

      // refetch
      const fetchedProfiles = await catalog.list();
      setProfiles(fetchedProfiles);
      setConfirmPkImport(false);
    }, [mx, pkImportSettings])
  );

  // import, export, etc
  const [handlePersonaExportState, handlePersonaExport] = useAsyncCallback<void, Error, []>(
    useCallback(async () => {
      const personas = await new ProfileCatalog(mx).list();
      const data = { personas };
      await downloadJsonFile(JSON.stringify(data), 'persona');
    }, [mx])
  );

  const [handlePersonaImportState, handlePersonaImport] = useAsyncCallback<void, Error, []>(
    useCallback(async () => {
      const file = await selectFile('application/json', false);
      if (!file) throw new Error('No file provided');

      const text = await readFileToString(file);
      const json = JSON.parse(text);
      if (!json.personas) throw new Error('Personas not found in file');

      await new ProfileCatalog(mx).overwrite(json.personas as Persona[]);

      // refetch
      const fetchedProfiles = await getAllPerMessageProfiles(mx);
      setProfiles(fetchedProfiles);
    }, [mx])
  );

  const [handlePersonaWipeState, handlePersonaWipe] = useAsyncCallback<void, Error, []>(
    useCallback(async () => {
      await new ProfileCatalog(mx).overwrite([]);

      // refetch
      const fetchedProfiles = await getAllPerMessageProfiles(mx);
      setProfiles(fetchedProfiles);
      setConfirmWipeData(false);
    }, [mx])
  );

  const manageError = useMemo(() => {
    if (handlePersonaExportState.status == AsyncStatus.Error) return handlePersonaExportState.error;
    if (handlePersonaImportState.status == AsyncStatus.Error) return handlePersonaImportState.error;
    if (handlePersonaWipeState.status == AsyncStatus.Error) return handlePersonaWipeState.error;
    return undefined;
  }, [handlePersonaExportState, handlePersonaImportState, handlePersonaWipeState]);

  return (
    <>
      <Box gap="100" direction="Column">
        <Text size="L400">Personas</Text>

        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="100"
        >
          <SettingTile
            focusId="create-pmp"
            title="Create Persona"
            description="Create Personas to attach custom profiles to messages."
            after={
              <Button
                size="300"
                radii="300"
                onClick={handleAdd}
                disabled={addState.status === AsyncStatus.Loading}
              >
                {addState.status === AsyncStatus.Loading ? (
                  <Spinner size="100" variant="Primary" fill="Solid" />
                ) : (
                  <Text size="B300">Add</Text>
                )}
              </Button>
            }
          />
        </SequenceCard>

        {profiles.map((profile) => (
          <SequenceCard
            className={SequenceCardStyle}
            variant="SurfaceVariant"
            direction="Column"
            key={`profile-list-item-${profile.id}`}
          >
            <PerMessageProfileListItem
              mx={mx}
              avatarMxcUrl={profile.avatar_url}
              displayName={profile.displayname}
              pronouns={profile[MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME]}
              profileId={profile.id}
              nameColorLight={profile[MATRIX_UNSTABLE_COLORS]?.on_light}
              nameColorDark={profile[MATRIX_UNSTABLE_COLORS]?.on_dark}
              onOpenEditor={handleEdit}
            />
          </SequenceCard>
        ))}
      </Box>
      <Box gap="100" direction="Column">
        <Text size="L400">Persona Management</Text>

        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="100"
        >
          <SettingTile
            focusId="pmp-pk-import"
            title="PluralKit Import"
            description={
              <>
                Add or update PluralKit members from <code>system.json</code>. Consider backing up
                Persona data before importing.
              </>
            }
            after={
              <Button
                onClick={() => setConfirmPkImport(true)}
                size="400"
                radii="300"
                variant="Primary"
                fill="Solid"
              >
                {handlePkitImportState.status === AsyncStatus.Loading ? (
                  <Spinner variant="Primary" size="400" />
                ) : (
                  <Text size="B300">Import PK member data</Text>
                )}
              </Button>
            }
          ></SettingTile>
        </SequenceCard>
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="100"
        >
          <SettingTile
            focusId="pmp-list-export"
            title="Persona data management"
            description="Backup and restore your persona data."
          >
            {manageError && (
              <Text style={{ color: color.Critical.Main }} size="T300">
                {manageError.message}
              </Text>
            )}
            <Box
              direction="Row"
              justifyContent="End"
              wrap="WrapReverse"
              gap="200"
              aria-label="PMP List edit buttons"
            >
              <Button
                onClick={handlePersonaExport}
                size="400"
                radii="300"
                variant="Primary"
                fill="Solid"
              >
                {handlePersonaExportState.status === AsyncStatus.Loading ? (
                  <Spinner variant="Primary" size="400" />
                ) : (
                  <Text size="B300">Export data</Text>
                )}
              </Button>
              <Button
                onClick={handlePersonaImport}
                size="400"
                radii="300"
                variant="Primary"
                fill="Soft"
              >
                {handlePersonaImportState.status === AsyncStatus.Loading ? (
                  <Spinner variant="Primary" size="300" />
                ) : (
                  <Text size="B300">Overwrite data from a backup</Text>
                )}
              </Button>
              <Button
                onClick={() => setConfirmWipeData(true)}
                size="400"
                radii="300"
                variant="Critical"
                fill="Solid"
              >
                <Text size="B300">Wipe all Persona data</Text>
              </Button>
            </Box>
            {confirmPkImport && (
              <ModalOverlay requestClose={() => setConfirmPkImport(false)}>
                <Dialog variant="Surface">
                  <Header
                    style={{
                      padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                      borderBottomWidth: config.borderWidth.B300,
                    }}
                    variant="Surface"
                    size="500"
                  >
                    <Box grow="Yes">
                      <Text size="H4">Import PluralKit data</Text>
                    </Box>
                  </Header>
                  <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                    <Box direction="Column" justifyContent="SpaceBetween" gap="100">
                      <Text priority="400" style={{ fontWeight: 'bold' }}>
                        Configure import
                      </Text>

                      <SequenceCard
                        className={SequenceCardStyle}
                        variant="SurfaceVariant"
                        direction="Column"
                        gap="100"
                      >
                        <Box direction="Row" justifyContent="SpaceBetween">
                          <Text>Extract pronouns from display names</Text>
                          <Switch
                            variant="Primary"
                            value={!!pkImportSettings?.extractPronouns}
                            onChange={(on) =>
                              setPkImportSettings((opts) => {
                                return { ...opts, extractPronouns: on };
                              })
                            }
                          />
                        </Box>
                      </SequenceCard>
                      <AsyncError state={handlePkitImportState} prefix="Failed to import" />
                    </Box>
                    <Box direction="Row" justifyContent="End" gap="200">
                      <Button variant="Secondary" onClick={() => setConfirmPkImport(false)}>
                        <Text size="B400">Cancel</Text>
                      </Button>
                      <Button variant="Primary" onClick={handlePkitImport}>
                        {handlePkitImportState.status === AsyncStatus.Loading ? (
                          <Spinner variant="Primary" size="300" />
                        ) : (
                          <Text size="B400">Import</Text>
                        )}{' '}
                      </Button>
                    </Box>
                  </Box>
                </Dialog>
              </ModalOverlay>
            )}

            {confirmWipeData && (
              <ModalOverlay requestClose={() => setConfirmWipeData(false)}>
                <Dialog variant="Surface">
                  <Header
                    style={{
                      padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                      borderBottomWidth: config.borderWidth.B300,
                    }}
                    variant="Surface"
                    size="500"
                  >
                    <Box grow="Yes">
                      <Text size="H4">Wipe all Persona data</Text>
                    </Box>
                  </Header>
                  <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                    <Text priority="400">Are you sure you want to wipe all Persona data?</Text>
                    <Box direction="Column" gap="200">
                      <Button variant="Critical" onClick={handlePersonaWipe}>
                        <Text size="B400">Delete all data</Text>
                      </Button>
                      <Button variant="Secondary" onClick={() => setConfirmWipeData(false)}>
                        <Text size="B400">Cancel</Text>
                      </Button>
                    </Box>
                  </Box>
                </Dialog>
              </ModalOverlay>
            )}
          </SettingTile>
        </SequenceCard>
      </Box>
    </>
  );
}
