import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { Box, Button, Text, Avatar, config, IconButton, Input } from 'folds';
import { menuIcon, X } from '$components/icons/phosphor';
import type { MatrixClient } from '$types/matrix-sdk';
import { useCallback, useMemo, useState } from 'react';
import { nameInitials } from '$utils/common';
import { mxcUrlToHttp } from '$utils/matrix';
import { useFilePicker } from '$hooks/useFilePicker';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useObjectURL } from '$hooks/useObjectURL';
import { createUploadAtom } from '$state/upload';
import { UserAvatar } from '$components/user-avatar';
import { CompactUploadCardRenderer } from '$components/upload-card';
import {
  addOrUpdatePerMessageProfile,
  deletePerMessageProfile,
  renamePerMessageProfile,
} from '$hooks/usePerMessageProfile';
import type { PronounSet } from '$utils/pronouns';
import { parsePronounsStringToPronounsSetArray } from '$utils/pronouns';
import { SettingTile } from '$components/setting-tile';

/**
 * the props we use for the per-message profile editor, which is used to edit a per-message profile. This is used in the settings page when the user wants to edit a profile.
 */
type PerMessageProfileEditorProps = {
  mx: MatrixClient;
  profileId: string;
  avatarMxcUrl?: string;
  displayName?: string;
  pronouns?: PronounSet[];
  onDelete?: (profileId: string) => void;
};

export function PerMessageProfileEditor({
  mx,
  profileId,
  avatarMxcUrl,
  displayName,
  pronouns = Array<PronounSet>(),
  onDelete,
}: Readonly<PerMessageProfileEditorProps>) {
  const useAuthentication = useMediaAuthentication();
  const [currentDisplayName, setCurrentDisplayName] = useState(displayName ?? '');
  const [currentId, setCurrentId] = useState(profileId);
  const [newId, setNewId] = useState(profileId);

  // Pronouns
  const [currentPronouns, setCurrentPronouns] = useState(pronouns);
  const [newPronouns, setNewPronouns] = useState(pronouns);
  const currentPronounsString = useMemo(
    () =>
      Array.isArray(currentPronouns)
        ? currentPronouns.map((p) => `${p.language ? `${p.language}:` : ''}${p.summary}`).join(', ')
        : '',
    [currentPronouns]
  );
  const [newPronounsString, setNewPronounsString] = useState(() => {
    const pronounsString = Array.isArray(newPronouns)
      ? newPronouns.map((p) => `${p.language ? `${p.language}:` : ''}${p.summary}`).join(', ')
      : '';
    return pronounsString;
  });

  const [newDisplayName, setNewDisplayName] = useState(currentDisplayName);
  const [imageFile, setImageFile] = useState<File | undefined>();
  const [imageHasChanges, setImageHasChanges] = useState(false);
  const [avatarMxc, setAvatarMxc] = useState(avatarMxcUrl);
  const imageFileURL = useObjectURL(imageFile);
  const avatarUrl = useMemo(() => {
    if (imageFileURL) return imageFileURL;
    if (avatarMxc) {
      return mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined;
    }
    return undefined;
  }, [imageFileURL, avatarMxc, mx, useAuthentication]);
  const uploadAtom = useMemo(() => {
    if (imageFile) return createUploadAtom(imageFile);
    return undefined;
  }, [imageFile]);
  const pickFile = useFilePicker(setImageFile, false);
  const handleRemoveUpload = useCallback(() => {
    setImageFile(undefined);
    setImageHasChanges(true);
  }, []);
  const handleUploaded = useCallback((upload: { status: string; mxc: string }) => {
    if (upload?.status === 'success') {
      setAvatarMxc(upload.mxc);
      setImageHasChanges(true);
    }
    setImageFile(undefined);
  }, []);
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewDisplayName(e.target.value);
  }, []);

  const [changingDisplayName, setChangingDisplayName] = useState(false);
  // This state is used to disable the display name input while the user is changing it, to prevent them from making changes while the save operation is in progress.
  // It is set to true when the user clicks the save button, and set back to false when the save operation is complete.
  const [disableSetDisplayname, setDisableSetDisplayname] = useState(false);

  const hasIdChange = useMemo(() => newId !== currentId, [newId, currentId]);

  const hasChanges = useMemo(
    () =>
      newDisplayName !== (currentDisplayName ?? '') ||
      newPronounsString !== currentPronounsString ||
      hasIdChange ||
      imageHasChanges,
    [
      newDisplayName,
      currentDisplayName,
      newPronounsString,
      currentPronounsString,
      hasIdChange,
      imageHasChanges,
    ]
  );

  /**
   * handler for resetting the display name
   */
  const handleDisplayNameReset = useCallback(() => {
    setNewDisplayName(currentDisplayName ?? '');
  }, [currentDisplayName]);

  /**
   * handler for resetting the pronouns
   */
  const handlePronounsReset = useCallback(() => {
    setNewPronouns(currentPronouns);
    setNewPronounsString(currentPronounsString);
  }, [currentPronouns, currentPronounsString]);

  /**
   * persisting the data :3
   */
  const handleSave = useCallback(() => {
    addOrUpdatePerMessageProfile(mx, {
      id: profileId,
      name: newDisplayName,
      avatarUrl: avatarMxc,
      pronouns: newPronouns,
    }).then(() => {
      setCurrentDisplayName(newDisplayName);
      setCurrentPronouns(newPronouns);
      setImageHasChanges(false);
      setChangingDisplayName(false);
      setDisableSetDisplayname(false);
      if (hasIdChange) {
        renamePerMessageProfile(mx, profileId, newId).then(() => {
          setCurrentId(newId);
        });
      }
    });
  }, [mx, profileId, newDisplayName, avatarMxc, newPronouns, hasIdChange, newId]);

  const handleDelete = useCallback(() => {
    deletePerMessageProfile(mx, profileId).then(() => {
      setCurrentDisplayName('');
      setCurrentPronouns([]);
      if (onDelete) onDelete(profileId);
    });
  }, [mx, profileId, onDelete]);

  const handleIdChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewId(e.target.value);
  }, []);

  const handlePronounsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewPronounsString(e.target.value);
    return setNewPronouns(parsePronounsStringToPronounsSetArray(e.target.value));
  }, []);

  return (
    <Box
      direction="Column"
      gap="100"
      role="form"
      aria-labelledby={`profile-editor-title-${profileId}`}
    >
      <Text size="L400">Profile</Text>

      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile title="Profile ID" focusId={`idInput-${profileId}`}>
          <Box grow="Yes" direction="Column">
            <Input
              required
              name="idInput"
              id={`idInput-${profileId}`}
              value={newId}
              onChange={handleIdChange}
              variant="Secondary"
              radii="300"
              placeholder="Profile ID"
              style={{ paddingRight: config.space.S200 }}
              aria-label="profile id"
              title="profile id"
            />
          </Box>
        </SettingTile>
      </SequenceCard>

      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Avatar"
          focusId={`avatar-${profileId}`}
          after={
            <Avatar size="500" radii="300" aria-label="Profile avatar">
              <UserAvatar
                userId={profileId}
                src={avatarUrl}
                renderFallback={() => (
                  <Text size="H4" aria-label="Avatar fallback">
                    {nameInitials(displayName)}
                  </Text>
                )}
                alt={`Avatar for profile ${profileId}`}
              />
            </Avatar>
          }
        >
          <Box>
            <Button
              onClick={() => pickFile('image/*')}
              size="300"
              variant="Secondary"
              fill="Soft"
              outlined
              radii="300"
              aria-label="Upload avatar image"
            >
              <Text size="T200">Upload</Text>
            </Button>
          </Box>
          {uploadAtom && (
            <Box
              gap="100"
              direction="Column"
              style={{
                width: '100%',
                maxWidth: 100,
                maxHeight: 100,
                overflow: 'visible',
              }}
              aria-label="Upload area"
            >
              <CompactUploadCardRenderer
                uploadAtom={uploadAtom}
                onRemove={handleRemoveUpload}
                onComplete={handleUploaded}
              />
            </Box>
          )}
        </SettingTile>
      </SequenceCard>

      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile title="Display Name" focusId={`displayNameInput-${profileId}`}>
          <Box grow="Yes" direction="Column">
            <Input
              required
              name="displayNameInput"
              id={`displayNameInput-${profileId}`}
              value={newDisplayName}
              onChange={handleNameChange}
              variant="Secondary"
              radii="300"
              style={{
                paddingRight: config.space.S200,
              }}
              placeholder="Display name"
              readOnly={changingDisplayName || disableSetDisplayname}
              aria-label={`Display name for ${profileId}`}
              title={`Display name for ${profileId}`}
              after={
                newDisplayName !== (currentDisplayName ?? '') &&
                !changingDisplayName && (
                  <IconButton
                    type="reset"
                    onClick={handleDisplayNameReset}
                    size="300"
                    radii="300"
                    variant="Secondary"
                    aria-label="Reset display name"
                    title="Reset display name"
                  >
                    {menuIcon(X)}
                  </IconButton>
                )
              }
            />
          </Box>
        </SettingTile>
      </SequenceCard>

      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Pronouns"
          description="Separate sets with commas"
          focusId={`pronounsInput-${profileId}`}
          after={
            <Input
              required
              name="pronounsInput"
              id={`pronounsInput-${profileId}`}
              value={newPronounsString}
              onChange={handlePronounsChange}
              variant="Secondary"
              radii="300"
              style={{
                paddingRight: config.space.S200,
                width: '232px',
              }}
              placeholder="Add pronouns..."
              readOnly={changingDisplayName || disableSetDisplayname}
              aria-label={`Pronouns for ${profileId}`}
              title={`Pronouns for ${profileId}`}
              after={
                newPronounsString !== currentPronounsString && (
                  <IconButton
                    type="reset"
                    onClick={handlePronounsReset}
                    size="300"
                    radii="300"
                    variant="Secondary"
                    aria-label="Reset pronouns"
                    title="Reset pronouns"
                  >
                    {menuIcon(X)}
                  </IconButton>
                )
              }
            />
          }
        ></SettingTile>
      </SequenceCard>
      <Box
        direction="Row"
        alignItems="Center"
        justifyContent="End"
        gap="200"
        aria-label={`Save button area for ${profileId}`}
      >
        <Button
          onClick={handleDelete}
          size="400"
          radii="300"
          variant="Critical"
          fill="None"
          aria-label={`Delete profile ${profileId}`}
          title={`Delete profile ${profileId}`}
        >
          <Text size="B300">Delete</Text>
        </Button>

        <Button
          onClick={handleSave}
          size="400"
          radii="300"
          variant="Primary"
          disabled={!hasChanges}
          aria-label={`Save profile changes for ${profileId}`}
          title={`Save profile changes for ${profileId}`}
        >
          <Text size="B300">Save</Text>
        </Button>
      </Box>
    </Box>
  );
}
