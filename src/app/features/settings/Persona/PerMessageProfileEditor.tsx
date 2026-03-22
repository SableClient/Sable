import { SequenceCard } from '$components/sequence-card';
import { Box, Button, Text, Avatar, config, Icon, IconButton, Icons, Input } from 'folds';
import { MatrixClient } from 'matrix-js-sdk';
import { useCallback, useMemo, useState } from 'react';
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
import { parsePronounsStringToPronounsSetArray, PronounSet } from '$utils/pronouns';
import { SequenceCardStyle } from '../styles.css';

/**
 * the props we use for the per-message profile editor, which is used to edit a per-message profile. This is used in the settings page when the user wants to edit a profile.
 */
type PerMessageProfileEditorProps = {
  mx: MatrixClient;
  profileId: string;
  avatarMxcUrl?: string;
  displayName?: string;
  pronouns?: PronounSet[];
  onChange?: (profile: { id: string; name: string; avatarUrl?: string }) => void;
  onDelete?: (profileId: string) => void;
};

export function PerMessageProfileEditor({
  mx,
  profileId,
  avatarMxcUrl,
  displayName,
  pronouns = Array<PronounSet>(),
  onChange,
  onDelete,
}: Readonly<PerMessageProfileEditorProps>) {
  const useAuthentication = useMediaAuthentication();
  const [currentDisplayName, setCurrentDisplayName] = useState(displayName ?? '');
  const [currentId, setCurrentId] = useState(profileId);
  const [newId, setNewId] = useState(profileId);

  console.warn(pronouns);

  // Pronouns
  const [currentPronouns, setCurrentPronouns] = useState<PronounSet[]>(pronouns);
  const [newPronouns, setNewPronouns] = useState<PronounSet[]>(pronouns);
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
  const handleUploaded = useCallback(
    (upload: { status: string; mxc: string }) => {
      if (upload?.status === 'success') {
        setAvatarMxc(upload.mxc);
        if (onChange) onChange({ id: profileId, name: newDisplayName, avatarUrl: upload.mxc });
        setImageHasChanges(true);
      }
      setImageFile(undefined);
    },
    [onChange, profileId, newDisplayName]
  );
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
      gap="200"
      grow="Yes"
      style={{
        width: '100%',
        minWidth: 500,
        paddingTop: config.space.S400,
        paddingBottom: config.space.S400,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      role="form"
      aria-labelledby={`profile-editor-title-${profileId}`}
    >
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="300"
        style={{
          width: '100%',
          minWidth: 500,
          minHeight: 100,
          maxHeight: 240,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          position: 'relative',
          overflow: 'visible',
        }}
      >
        {/* Profile ID heading and input */}
        <Box
          direction="Row"
          gap="200"
          alignItems="Center"
          style={{ width: '100%', marginBottom: config.space.S200 }}
        >
          <Text size="H6" id={`profile-editor-title-${profileId}`} style={{ minWidth: 90 }}>
            Profile ID:
          </Text>
          <Input
            required
            name="idInput"
            id={`idInput-${profileId}`}
            value={newId}
            onChange={handleIdChange}
            variant="Secondary"
            radii="300"
            style={{
              flex: 1,
              minWidth: 0,
              maxWidth: 'clamp(200px, 60vw, 480px)',
              paddingRight: config.space.S200,
              fontSize: 16,
              height: 50,
            }}
            placeholder="Profile ID"
            aria-label="profile id"
            title="profile id"
          />
        </Box>
        <Box direction="Row">
          <Box
            direction="Column"
            alignItems="Center"
            justifyContent="Center"
            gap="100"
            style={{
              minWidth: 80,
              maxWidth: 100,
              maxHeight: 100,
              flexShrink: 0,
              overflow: 'visible',
              marginTop: 20,
            }}
            aria-label="Avatar and upload"
          >
            <Avatar
              size="300"
              radii="300"
              style={{
                width: 'clamp(25px, 8vw, 50px)',
                height: 'clamp(25px, 8vw, 50px)',
                minWidth: 48,
                minHeight: 48,
                maxWidth: 72,
                maxHeight: 72,
              }}
              aria-label="Profile avatar"
            >
              <UserAvatar
                userId={profileId}
                src={avatarUrl}
                renderFallback={() => (
                  <Text size="H4" aria-label="Avatar fallback">
                    p
                  </Text>
                )}
                alt={`Avatar for profile ${profileId}`}
              />
            </Avatar>
            <Button
              onClick={() => pickFile('image/*')}
              size="300"
              variant="Secondary"
              fill="Soft"
              outlined
              radii="300"
              style={{
                width: 'clamp(30px, 6vw, 60px)',
                marginTop: config.space.S100,
                overflow: 'visible',
                fontSize: 14,
                padding: '0 8px',
              }}
              aria-label="Upload avatar image"
            >
              <Text size="T200">Upload</Text>
            </Button>
            {uploadAtom && (
              <Box
                gap="100"
                direction="Column"
                style={{ width: '100%', maxWidth: 100, maxHeight: 100, overflow: 'visible' }}
                aria-label="Upload area"
              >
                <CompactUploadCardRenderer
                  uploadAtom={uploadAtom}
                  onRemove={handleRemoveUpload}
                  onComplete={handleUploaded}
                />
              </Box>
            )}
          </Box>
          <Box
            direction="Column"
            alignItems="Center"
            justifyContent="Center"
            style={{ flex: 1, minWidth: 0, height: '100%' }}
            aria-label="Display name input"
          >
            <Text size="T300" style={{ marginBottom: config.space.S200, alignSelf: 'flex-start' }}>
              Display Name:
            </Text>
            <Input
              required
              name="displayNameInput"
              id={`displayNameInput-${profileId}`}
              value={newDisplayName}
              onChange={handleNameChange}
              variant="Secondary"
              radii="300"
              style={{
                flex: 1,
                minWidth: 0,
                width: '100%',
                maxWidth: 'clamp(200px, 60vw, 480px)',
                paddingRight: config.space.S200,
                fontSize: 16,
                height: 50,
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
                    <Icon src={Icons.Cross} size="100" aria-label="Reset icon" />
                  </IconButton>
                )
              }
            />
            <Text
              size="T300"
              style={{
                marginTop: config.space.S100,
                marginBottom: config.space.S200,
                alignSelf: 'flex-start',
              }}
            >
              Pronouns:
            </Text>
            <Input
              required
              name="pronounsInput"
              id={`pronounsInput-${profileId}`}
              value={newPronounsString}
              onChange={handlePronounsChange}
              variant="Secondary"
              radii="300"
              style={{
                flex: 1,
                minWidth: 0,
                width: '100%',
                maxWidth: 'clamp(200px, 60vw, 480px)',
                paddingRight: config.space.S200,
                fontSize: 16,
                height: 50,
              }}
              placeholder="Pronouns"
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
                    <Icon src={Icons.Cross} size="100" aria-label="Reset icon" />
                  </IconButton>
                )
              }
            />
          </Box>
          {/* Rechte Spalte: Save Button */}
          <Box
            direction="Column"
            alignItems="Center"
            justifyContent="Center"
            style={{ minWidth: 120, maxWidth: 140, flexShrink: 0, height: '100%' }}
            aria-label={`Save button area for ${profileId}`}
          >
            <Button
              onClick={handleSave}
              size="300"
              radii="300"
              variant="Primary"
              disabled={!hasChanges}
              style={{
                minWidth: 120,
                height: 'clamp(30px, 6vw, 50px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label={`Save profile changes for ${profileId}`}
              title={`Save profile changes for ${profileId}`}
            >
              <Text size="B300">Save</Text>
            </Button>
            <Button
              onClick={handleDelete}
              size="300"
              radii="300"
              variant="Critical"
              fill="None"
              style={{
                minWidth: 120,
                height: 'clamp(30px, 6vw, 50px)',
                marginTop: config.space.S100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label={`Delete profile ${profileId}`}
              title={`Delete profile ${profileId}`}
            >
              <Text size="B300">Delete</Text>
            </Button>
          </Box>
        </Box>
      </SequenceCard>
    </Box>
  );
}
