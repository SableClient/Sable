import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { nanoid } from 'nanoid';
import { Box, Button, Text, Avatar, config, IconButton, Input, toRem, Spinner, color } from 'folds';
import { menuIcon, Trash, X } from '$components/icons/phosphor';
import type { MatrixClient } from '$types/matrix-sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { nameInitials } from '$utils/common';
import { mxcUrlToHttp } from '$utils/matrix';
import { useFilePicker } from '$hooks/useFilePicker';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useObjectURL } from '$hooks/useObjectURL';
import { createUploadAtom } from '$state/upload';
import { UserAvatar } from '$components/user-avatar';
import { CompactUploadCardRenderer } from '$components/upload-card';
import type { ProfileTrigger } from '$hooks/usePerMessageProfile';
import {
  addOrUpdatePerMessageProfile,
  deletePerMessageProfile,
  renamePerMessageProfile,
} from '$hooks/usePerMessageProfile';
import type { PronounSet } from '$utils/pronouns';
import { parsePronounsStringToPronounsSetArray } from '$utils/pronouns';
import { SettingTile } from '$components/setting-tile';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { NameColorEditor } from '../account/NameColorEditor';
import {
  MATRIX_UNSTABLE_COLORS,
  MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME,
} from '$unstable/prefixes';
import { accessibleColor } from '$plugins/color';
import { ThemeKind } from '$hooks/useTheme';

type ShorthandRow = ProfileTrigger & { id: string };

type ShorthandListItemProps = ShorthandRow & {
  onDelete: (shorthandId: string) => void;
  onChange: (shorthandId: string, shorthand: ProfileTrigger) => void;
};
function ShorthandListItem({ id, prefix, suffix, onDelete, onChange }: ShorthandListItemProps) {
  const [newPrefix, setNewPrefix] = useState(prefix);
  const [newSuffix, setNewSuffix] = useState(suffix);

  const [prefixWarn, setPrefixWarn] = useState(false);
  const [suffixWarn, setSuffixWarn] = useState(false);

  const handlePrefixChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(id, {
        prefix: e.target.value.trimStart(),
        suffix: newSuffix?.trimEnd(),
      });
      setNewPrefix(e.target.value);
    },
    [newSuffix, id, onChange]
  );
  const handleSuffixChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // if you call setNewSuffix then use newSuffix you get race conditioned lol
      onChange(id, {
        prefix: newPrefix?.trimStart(),
        suffix: e.target.value.trimEnd(),
      });
      setNewSuffix(e.target.value);
    },
    [newPrefix, id, onChange]
  );

  const isBlank = useMemo(() => !newPrefix && !newSuffix, [newPrefix, newSuffix]);

  useEffect(() => {
    setPrefixWarn((newPrefix ?? '').endsWith(' '));
    setSuffixWarn((newSuffix ?? '').startsWith(' '));
  }, [newPrefix, newSuffix]);

  return (
    <SequenceCard
      className={SequenceCardStyle}
      variant="Surface"
      style={{ padding: toRem(8) }}
      gap="100"
    >
      <Box
        direction="Column"
        style={{ width: '100%' }} /* sorry, complex layout, idk what's happening */
      >
        {(prefixWarn || suffixWarn) && (
          <Text size="T200" style={{ color: color.Warning.Main }}>
            Whitespace inside of a shorthand will require whitespace{' '}
            {prefixWarn && suffixWarn
              ? 'before/after'
              : prefixWarn
                ? 'before'
                : suffixWarn
                  ? 'after'
                  : 'before/after'}{' '}
            text to match.
          </Text>
        )}
        <Box direction="Row" gap="100">
          <Input
            value={newPrefix}
            style={{ flexGrow: 1, height: '2rem' }}
            placeholder="Prefix..."
            variant={prefixWarn ? 'Warning' : 'Secondary'}
            radii="300"
            onChange={handlePrefixChange}
          />
          <Input
            value={newSuffix}
            style={{ flexGrow: 1, height: '2rem' }}
            placeholder="Suffix..."
            variant={suffixWarn ? 'Warning' : 'Secondary'}
            radii="300"
            onChange={handleSuffixChange}
          />
          <Box gap="100" style={{ marginLeft: toRem(6) }}>
            <Button
              onClick={() => onDelete(id)}
              size="300"
              variant="Critical"
              disabled={isBlank}
              fill="Soft"
              outlined
              radii="300"
              aria-label="Delete shorthand"
            >
              {menuIcon(Trash)}
            </Button>
          </Box>
        </Box>
      </Box>
    </SequenceCard>
  );
}

function triggersToShorthandRows(triggers: ProfileTrigger[]): ShorthandRow[] {
  return triggers.map(({ prefix, suffix, keep_trigger }) => ({
    prefix,
    suffix,
    keep_trigger,
    id: nanoid(),
  }));
}

function shorthandRowsToTriggers(rows: ShorthandRow[]): ProfileTrigger[] {
  return rows.map(({ prefix, suffix, keep_trigger }) => ({ prefix, suffix, keep_trigger }));
}
/**
 * the props we use for the per-message profile editor, which is used to edit a per-message profile. This is used in the settings page when the user wants to edit a profile.
 */
export type PerMessageProfileEditorProps = {
  mx: MatrixClient;
  profileId: string;
  avatarMxcUrl?: string;
  displayName?: string;
  pronouns?: PronounSet[];
  nameColorLightTheme?: string;
  nameColorDarkTheme?: string;
  shorthands?: ProfileTrigger[];
  onDelete?: (profileId: string) => void;
};

export function PerMessageProfileEditor({
  mx,
  profileId,
  avatarMxcUrl,
  displayName,
  pronouns = Array<PronounSet>(),
  nameColorLightTheme,
  nameColorDarkTheme,
  shorthands,
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

  // Name color
  const [currentNameColorLight, setCurrentNameColorLight] = useState(nameColorLightTheme ?? null);
  const [newNameColorLight, setNewNameColorLight] = useState(nameColorLightTheme ?? null);
  const [currentNameColorDark, setCurrentNameColorDark] = useState(nameColorDarkTheme ?? null);
  const [newNameColorDark, setNewNameColorDark] = useState(nameColorDarkTheme ?? null);

  // shorthands
  const shorthandProp = shorthands ? triggersToShorthandRows(shorthands) : undefined;
  const [currentShorthands, setCurrentShorthands] = useState<ShorthandRow[] | undefined>(
    shorthandProp
  );
  const [newShorthands, setNewShorthands] = useState<ShorthandRow[] | undefined>(shorthandProp);

  const containsBlankShorthand = useMemo(
    () =>
      newShorthands && newShorthands.some((shorthand) => !shorthand.prefix && !shorthand.suffix),
    [newShorthands]
  );

  const handleAddShorthand = () => {
    if (newShorthands !== undefined) {
      setNewShorthands([...newShorthands, { id: nanoid() }]);
    }
  };

  const handleDeleteShorthand = (id: string) => {
    if (newShorthands === undefined) return;
    setNewShorthands((s) => s?.filter((shorthand) => shorthand.id !== id));
  };

  const handleSaveShorthand = (oldId: string, shorthand: ProfileTrigger) => {
    setNewShorthands((rows = []) => {
      const index = rows.findIndex((row) => row.id === oldId);
      if (index === -1) return rows;
      const oldShorthand = rows[index];
      if (oldShorthand === undefined) return rows;

      return rows.with(index, {
        ...shorthand,
        id: oldShorthand.id,
      });
    });
  };

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
      newNameColorLight !== currentNameColorLight ||
      newNameColorDark !== currentNameColorDark ||
      newShorthands !== currentShorthands ||
      hasIdChange ||
      imageHasChanges,
    [
      newDisplayName,
      currentDisplayName,
      newPronounsString,
      currentPronounsString,
      newNameColorLight,
      currentNameColorLight,
      newNameColorDark,
      currentNameColorDark,
      newShorthands,
      currentShorthands,
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
  const [saveState, handleSave] = useAsyncCallback(
    useCallback(async () => {
      await addOrUpdatePerMessageProfile(mx, {
        id: currentId,
        displayname: newDisplayName,
        avatar_url: avatarMxc,
        [MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME]: newPronouns,
        triggers: shorthandRowsToTriggers(newShorthands ?? []),
        [MATRIX_UNSTABLE_COLORS]: {
          on_light: newNameColorLight ?? undefined,
          on_dark: newNameColorDark ?? undefined,
        },
      });

      setCurrentDisplayName(newDisplayName);
      setCurrentPronouns(newPronouns);
      setCurrentNameColorLight(newNameColorLight);
      setCurrentNameColorDark(newNameColorDark);
      setCurrentShorthands(newShorthands);
      setImageHasChanges(false);
      setChangingDisplayName(false);
      setDisableSetDisplayname(false);
      if (hasIdChange) {
        await renamePerMessageProfile(mx, currentId, newId);
        setCurrentId(newId);
      }
    }, [
      mx,
      currentId,
      newDisplayName,
      avatarMxc,
      newPronouns,
      newNameColorLight,
      newNameColorDark,
      newShorthands,
      hasIdChange,
      newId,
    ])
  );

  const [deleteState, handleDelete] = useAsyncCallback(
    useCallback(async () => {
      await deletePerMessageProfile(mx, currentId);
      setCurrentDisplayName('');
      setCurrentPronouns([]);
      if (onDelete) onDelete(currentId);
    }, [mx, currentId, onDelete])
  );

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

      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <NameColorEditor
          title="Dark theme Name Color"
          description="This persona's name color for a dark theme user."
          focusId={`nameColorDarkTheme-${profileId}`}
          current={currentNameColorDark ?? undefined}
          newNameColor={newNameColorDark ?? undefined}
          onChange={setNewNameColorDark}
        />
        {!newNameColorLight && newNameColorDark && (
          <Box direction="Column" alignItems="End">
            <Button
              size="300"
              fill="Soft"
              onClick={() => {
                setNewNameColorLight(accessibleColor(ThemeKind.Light, newNameColorDark));
              }}
            >
              <Text size="T200">Create new color from dark theme</Text>
            </Button>
          </Box>
        )}
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <NameColorEditor
          title="Light theme Name Color"
          description="This persona's name color for a light theme user."
          focusId={`nameColorLightTheme-${profileId}`}
          current={currentNameColorLight ?? undefined}
          newNameColor={newNameColorLight ?? undefined}
          onChange={setNewNameColorLight}
        />
        {!newNameColorDark && newNameColorLight && (
          <Box direction="Column" alignItems="End">
            <Button
              size="300"
              fill="Soft"
              onClick={() => {
                setNewNameColorDark(accessibleColor(ThemeKind.Dark, newNameColorLight));
              }}
            >
              <Text size="T200">Create new color from light theme</Text>
            </Button>
          </Box>
        )}
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
          disabled={deleteState.status === AsyncStatus.Loading}
          fill="None"
          aria-label={`Delete profile ${profileId}`}
          title={`Delete profile ${profileId}`}
        >
          {deleteState.status === AsyncStatus.Loading ? (
            <Spinner size="100" variant="Critical" fill="Solid" />
          ) : (
            <Text size="B300">Delete persona</Text>
          )}
        </Button>

        <Button
          onClick={handleSave}
          size="400"
          radii="300"
          variant="Primary"
          disabled={!hasChanges || saveState.status === AsyncStatus.Loading}
          aria-label={`Save profile changes for ${profileId}`}
          title={`Save profile changes for ${profileId}`}
        >
          {saveState.status === AsyncStatus.Loading ? (
            <Spinner size="100" variant="Primary" fill="Solid" />
          ) : (
            <Text size="B300">Save</Text>
          )}
        </Button>
      </Box>

      <Text size="L400">Shorthands</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Shorthands"
          description="Use this persona for a single message using a prefix or suffix."
          focusId={`shorthandsInput-${profileId}`}
        >
          {newShorthands === undefined ? (
            <Spinner size="400" />
          ) : (
            newShorthands.map((shorthand: ShorthandRow) => (
              <ShorthandListItem
                key={shorthand.id}
                id={shorthand.id}
                prefix={shorthand.prefix}
                suffix={shorthand.suffix}
                onDelete={handleDeleteShorthand}
                onChange={handleSaveShorthand}
              />
            ))
          )}
          <Button
            onClick={handleAddShorthand}
            size="400"
            radii="300"
            variant="Primary"
            disabled={containsBlankShorthand}
            /* add aria label and title pls */
          >
            <Text size="B300">Add new shorthand</Text>
          </Button>
        </SettingTile>
      </SequenceCard>
    </Box>
  );
}
