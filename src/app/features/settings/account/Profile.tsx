import type { ChangeEventHandler, FormEventHandler } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, IconButton, Input, Avatar, Button, config, Spinner } from 'folds';
import { menuIcon, Star, Sun, X } from '$components/icons/phosphor';
import { useSetAtom } from 'jotai';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import type { SettingMenuOption } from '$components/setting-menu-selector';
import { SettingMenuSelector } from '$components/setting-menu-selector';
import { SettingTile } from '$components/setting-tile';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { UserProfile, MSC4440Bio, ColorSet } from '$hooks/useUserProfile';
import { invalidateUserProfileCache, useUserProfile } from '$hooks/useUserProfile';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { UserAvatar } from '$components/user-avatar';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { nameInitials, xor } from '$utils/common';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useFilePicker } from '$hooks/useFilePicker';
import { useObjectURL } from '$hooks/useObjectURL';
import { toSettingsFocusIdPart } from '$features/settings/settingsLink';
import type { UploadSuccess } from '$state/upload';
import { createUploadAtom } from '$state/upload';
import { CompactUploadCardRenderer } from '$components/upload-card';
import { Image as MediaImage } from '$components/media';
import { useCapabilities } from '$hooks/useCapabilities';
import { profilesCacheAtom } from '$state/userRoomProfile';
import { useUserPresence } from '$hooks/useUserPresence';
import { useSpecVersions } from '$hooks/useSpecVersions';
import { useSetting } from '$state/hooks/settings';
import type { ProfileChangePropagation } from '$state/settings';
import { settingsAtom } from '$state/settings';
import type { MSC1767Text } from '$types/matrix/common';
import { setAvatarUrlWithPropagation, setDisplayNameWithPropagation } from '$utils/msc4466';
import { TimezoneEditor } from './TimezoneEditor';
import { PronounEditor } from './PronounEditor';
import { BioEditor } from './BioEditor';
import { NameColorEditor } from './NameColorEditor';
import { StatusEditor } from './StatusEditor';
import { AnimalCosmetics } from './AnimalCosmetics';
import * as prefix from '$unstable/prefixes';
import { showToast } from '$state/toast';
import { confirm } from '$components/confirm/confirm';
import { AvatarUploadTile } from '$components/avatar-upload-tile/AvatarUploadTile';
import { accessibleColor } from '$plugins/color';
import { ThemeKind } from '$hooks/useTheme';

type PronounSet = {
  summary: string;
  language?: string;
};

type ProfileProps = {
  profile: UserProfile;
  userId: string;
  propagateTo?: ProfileChangePropagation;
};
function ProfileAvatar({ profile, userId, propagateTo }: Readonly<ProfileProps>) {
  const mx = useMatrixClient();
  const setGlobalProfiles = useSetAtom(profilesCacheAtom);
  const useAuthentication = useMediaAuthentication();
  const capabilities = useCapabilities();
  const disableSetAvatar = capabilities['m.set_avatar_url']?.enabled === false;

  const defaultDisplayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? (mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined)
    : undefined;

  const handleUploaded = useCallback(
    async (mxc: string) => {
      await setAvatarUrlWithPropagation(mx, mxc, propagateTo);
      setGlobalProfiles((prev) => ({
        ...prev,
        [userId]: { ...prev[userId], avatarUrl: mxc },
      }));
    },
    [mx, userId, propagateTo, setGlobalProfiles]
  );

  const handleRemoveAvatar = useCallback(async () => {
    await setAvatarUrlWithPropagation(mx, '', propagateTo);
    setGlobalProfiles((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], avatarUrl: undefined },
    }));
  }, [mx, userId, propagateTo, setGlobalProfiles]);

  return (
    <AvatarUploadTile
      title="Avatar"
      focusId="avatar"
      disableSetAvatar={disableSetAvatar}
      removeDisabled={!avatarUrl}
      onUpload={handleUploaded}
      onRemove={handleRemoveAvatar}
      confirmTitle="Remove Avatar"
      confirmDescription="Are you sure you want to remove profile avatar?"
      after={
        <Avatar size="500" radii="300">
          <UserAvatar
            userId={userId}
            src={avatarUrl}
            renderFallback={() => <Text size="H4">{nameInitials(defaultDisplayName)}</Text>}
          />
        </Avatar>
      }
    />
  );
}

function ProfileBanner({ profile, userId }: Readonly<Pick<ProfileProps, 'profile' | 'userId'>>) {
  const mx = useMatrixClient();
  const setGlobalProfiles = useSetAtom(profilesCacheAtom);
  const useAuthentication = useMediaAuthentication();
  const [stagedUrl, setStagedUrl] = useState<string>();
  const [isRemoving, setIsRemoving] = useState(false);

  const bannerUrl = profile.bannerUrl
    ? (mxcUrlToHttp(mx, profile.bannerUrl, useAuthentication) ?? undefined)
    : undefined;

  useEffect(() => {
    if (bannerUrl) {
      setStagedUrl(undefined);
    }
  }, [bannerUrl]);

  const [imageFile, setImageFile] = useState<File>();
  const imageFileURL = useObjectURL(imageFile);

  const uploadAtom = useMemo(() => {
    if (imageFile) return createUploadAtom(imageFile);
    return undefined;
  }, [imageFile]);

  const pickFile = useFilePicker(setImageFile, false);

  const handlePick = useCallback(() => {
    setIsRemoving(false);
    setStagedUrl(undefined);
    pickFile('image/*');
  }, [pickFile]);

  const handleRemoveUpload = useCallback(() => {
    setImageFile(undefined);
  }, []);

  const handleUploaded = useCallback(
    async (upload: UploadSuccess) => {
      const { mxc } = upload;

      if (imageFileURL) setStagedUrl(imageFileURL);
      setImageFile(undefined);

      try {
        await mx.setExtendedProfileProperty?.(
          prefix.MATRIX_UNSTABLE_PROFILE_BANNER_PROPERTY_NAME,
          mxc
        );
      } catch (error) {
        showToast(
          `Failed to save profile field: ${error instanceof Error ? error.message : String(error)}`
        );
        setStagedUrl(undefined);
        return;
      }
      invalidateUserProfileCache(mx, userId, setGlobalProfiles);
    },
    [mx, userId, imageFileURL, setGlobalProfiles]
  );

  const handleRemoveBanner = async () => {
    const ok = await confirm({
      title: 'Remove Banner',
      description: 'Are you sure you want to remove profile banner?',
      action: 'Remove',
      variant: 'Critical',
    });
    if (ok) {
      setIsRemoving(true);
      setStagedUrl(undefined);
      setImageFile(undefined);
      try {
        await mx.setExtendedProfileProperty?.(
          prefix.MATRIX_UNSTABLE_PROFILE_BANNER_PROPERTY_NAME,
          null
        );
      } catch (error) {
        showToast(
          `Failed to save profile field: ${error instanceof Error ? error.message : String(error)}`
        );
        setIsRemoving(false);
        return;
      }
      invalidateUserProfileCache(mx, userId, setGlobalProfiles);
    }
  };

  const previewUrl = isRemoving ? undefined : imageFileURL || stagedUrl || bannerUrl;

  return (
    <SettingTile title="Banner" focusId="banner">
      <Box direction="Column" gap="300" grow="Yes">
        <Box
          style={{
            height: '100px',
            width: '100%',
            borderRadius: config.radii.R400,
            overflow: 'hidden',
            backgroundColor: 'var(--sable-surface-container)',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {previewUrl ? (
            <MediaImage
              src={previewUrl}
              key={previewUrl}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              alt="Banner Preview"
            />
          ) : (
            <Box justifyContent="Center" alignItems="Center">
              <Text priority="300" size="T200">
                No Banner Set
              </Text>
            </Box>
          )}
        </Box>

        {uploadAtom ? (
          <Box gap="200" direction="Column">
            <CompactUploadCardRenderer
              uploadAtom={uploadAtom}
              onRemove={handleRemoveUpload}
              onComplete={handleUploaded}
            />
          </Box>
        ) : (
          <Box gap="200">
            <Button
              onClick={handlePick}
              size="300"
              variant="Secondary"
              fill="Soft"
              outlined
              radii="300"
            >
              <Text size="B300">{bannerUrl ? 'Change Banner' : 'Upload Banner'}</Text>
            </Button>
            {bannerUrl && (
              <Button
                size="300"
                variant="Critical"
                fill="None"
                radii="300"
                onClick={handleRemoveBanner}
              >
                <Text size="B300">Remove</Text>
              </Button>
            )}
          </Box>
        )}
      </Box>
    </SettingTile>
  );
}

function ProfileDisplayName({ profile, userId, propagateTo }: Readonly<ProfileProps>) {
  const mx = useMatrixClient();
  const setGlobalProfiles = useSetAtom(profilesCacheAtom);
  const capabilities = useCapabilities();
  const disableSetDisplayname = capabilities['m.set_displayname']?.enabled === false;

  const defaultDisplayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const [displayName, setDisplayName] = useState(defaultDisplayName);

  const [changeState, changeDisplayName] = useAsyncCallback(
    useCallback(
      async (name: string) => {
        await setDisplayNameWithPropagation(mx, name, propagateTo);
        setGlobalProfiles((prev) => ({
          ...prev,
          [userId]: { ...prev[userId], displayName: name },
        }));
      },
      [mx, userId, propagateTo, setGlobalProfiles]
    )
  );
  const changingDisplayName = changeState.status === AsyncStatus.Loading;

  useEffect(() => {
    setDisplayName(defaultDisplayName);
  }, [defaultDisplayName]);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const name = evt.currentTarget.value;
    setDisplayName(name);
  };

  const handleReset = () => {
    setDisplayName(defaultDisplayName);
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (changingDisplayName) return;

    const target = evt.target as HTMLFormElement | undefined;
    const displayNameInput = target?.displayNameInput as HTMLInputElement | undefined;
    const name = displayNameInput?.value;
    if (!name) return;

    changeDisplayName(name);
  };

  const hasChanges = displayName !== defaultDisplayName;
  return (
    <SettingTile title="Display Name" focusId="display-name">
      <Box direction="Column" grow="Yes" gap="100">
        <Box
          as="form"
          onSubmit={handleSubmit}
          gap="200"
          aria-disabled={changingDisplayName || disableSetDisplayname}
        >
          <Box grow="Yes" direction="Column">
            <Input
              required
              name="displayNameInput"
              value={displayName}
              onChange={handleChange}
              variant="Secondary"
              radii="300"
              style={{ paddingRight: config.space.S200 }}
              readOnly={changingDisplayName || disableSetDisplayname}
              after={
                hasChanges &&
                !changingDisplayName && (
                  <IconButton
                    type="reset"
                    onClick={handleReset}
                    size="300"
                    radii="300"
                    variant="Secondary"
                  >
                    {menuIcon(X)}
                  </IconButton>
                )
              }
            />
          </Box>
          <Button
            size="400"
            variant={hasChanges ? 'Success' : 'Secondary'}
            fill={hasChanges ? 'Solid' : 'Soft'}
            outlined
            radii="300"
            disabled={!hasChanges || changingDisplayName}
            type="submit"
          >
            {changingDisplayName && <Spinner variant="Success" fill="Solid" size="300" />}
            <Text size="B400">Save</Text>
          </Button>
        </Box>
      </Box>
    </SettingTile>
  );
}

function ProfileChangePropagationSetting({ disabled }: { disabled: boolean }) {
  const [profileChangePropagation, setProfileChangePropagation] = useSetting(
    settingsAtom,
    'profileChangePropagation'
  );
  const options: SettingMenuOption<ProfileChangePropagation>[] = [
    { value: 'all', label: 'All rooms' },
    { value: 'unchanged', label: 'Unchanged rooms' },
    { value: 'none', label: 'Global only' },
  ];

  return (
    <SequenceCard
      className={SequenceCardStyle}
      variant="SurfaceVariant"
      direction="Column"
      gap="400"
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <SettingTile
        title="Profile change propagation"
        focusId="profile-change-propagation"
        description="Choose where global name and avatar changes are applied."
        after={
          <SettingMenuSelector
            value={profileChangePropagation}
            options={options}
            onSelect={setProfileChangePropagation}
            disabled={disabled}
          />
        }
      />
    </SequenceCard>
  );
}

function ProfileExtended({ profile, userId }: Readonly<ProfileProps>) {
  const mx = useMatrixClient();
  const setGlobalProfiles = useSetAtom(profilesCacheAtom);

  const pronouns = (profile.pronouns as PronounSet[]) || [];
  const presence = useUserPresence(userId);
  const currentStatus = presence?.status || '';

  // Keys we don't render here nor handle seperately but still need to exclude
  const EXCLUDED_KEYS = new Set([
    prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_IS_CAT_PROPERTY_NAME,
    prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_HAS_CAT_PROPERTY_NAME,
    prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_PROPERTY_NAME,
  ]);

  // Unknown fields / unimplemented non-matrix-spec fields
  // Only renders them, can't edit or set
  const extendedFields = Object.entries(profile.extended || {}).filter(
    ([key]) => !EXCLUDED_KEYS.has(key)
  );

  const handleSaveField = useCallback(
    async (key: string, value: unknown) => {
      try {
        await mx.setExtendedProfileProperty?.(key, value);
      } catch (error) {
        showToast(
          `Failed to save profile field: ${error instanceof Error ? error.message : String(error)}`
        );
        return;
      }
      invalidateUserProfileCache(mx, userId, setGlobalProfiles);
    },
    [mx, userId, setGlobalProfiles]
  );

  const handleSaveStatus = useCallback(
    async (newStatus: string) => {
      const currentState = presence?.presence || 'online';

      await mx.setPresence({
        presence: currentState,
        status_msg: newStatus,
      });
    },
    [mx, presence]
  );

  const colorOnDark =
    profile.nameColors?.on_dark ??
    (profile.extended?.[prefix.MATRIX_UNSTABLE_COLORS] as ColorSet | undefined)?.on_dark ??
    null;
  const colorOnLight =
    profile.nameColors?.on_light ??
    (profile.extended?.[prefix.MATRIX_UNSTABLE_COLORS] as ColorSet | undefined)?.on_light ??
    null;
  const [newColorOnDark, setNewColorOnDark] = useState<string | null>(null);
  const [newColorOnLight, setNewColorOnLight] = useState<string | null>(null);

  // Deletes the depricated key, the color specific ones should be depricated too at a later date
  const legacyColor = profile.nameColor;
  const migratedLegacyColor = useRef(false);
  useEffect(() => {
    if (!legacyColor || migratedLegacyColor.current) return;
    migratedLegacyColor.current = true;

    const migrate = async () => {
      if (!colorOnDark || !colorOnLight) {
        await handleSaveField(prefix.MATRIX_UNSTABLE_COLORS, {
          on_dark: colorOnDark ?? legacyColor,
          on_light: colorOnLight ?? legacyColor,
        });
      }
      await handleSaveField(prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_PROPERTY_NAME, null);
    };
    migrate();
  }, [legacyColor, colorOnDark, colorOnLight, handleSaveField]);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Extended Profile</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <StatusEditor current={currentStatus} onSave={handleSaveStatus} />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <NameColorEditor
          title="Dark theme Global Name Color"
          description="Your name's color for a dark theme user."
          focusId="name-color-dark-theme"
          current={colorOnDark ?? undefined}
          newNameColor={newColorOnDark ?? undefined}
          onChange={setNewColorOnDark}
          onSave={(color) =>
            handleSaveField(prefix.MATRIX_UNSTABLE_COLORS, {
              on_dark: color,
              on_light: newColorOnLight,
            })
          }
        />
        <NameColorEditor
          title="Light theme Global Name Color"
          description="Your name's color for a light theme user."
          focusId="name-color-light-theme"
          current={colorOnLight ?? undefined}
          newNameColor={newColorOnLight ?? undefined}
          onChange={setNewColorOnLight}
          onSave={(color) =>
            handleSaveField(prefix.MATRIX_UNSTABLE_COLORS, {
              on_dark: newColorOnDark,
              on_light: color,
            })
          }
        />
        {xor(newColorOnDark, newColorOnLight) && (
          <Box direction="Column" alignItems="End">
            {!newColorOnDark && newColorOnLight && (
              <Button
                size="300"
                fill="Soft"
                onClick={() => {
                  setNewColorOnDark(accessibleColor(ThemeKind.Dark, newColorOnLight));
                }}
              >
                <Text size="T200">Create new color from light theme</Text>
              </Button>
            )}
            {newColorOnDark && !newColorOnLight && (
              <Button
                size="300"
                fill="Soft"
                onClick={() => {
                  setNewColorOnLight(accessibleColor(ThemeKind.Light, newColorOnDark));
                }}
              >
                <Text size="T200">Create new color from dark theme</Text>
              </Button>
            )}
          </Box>
        )}
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <PronounEditor
          title="Pronouns"
          current={pronouns}
          onSave={(p) => handleSaveField(prefix.MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME, p)}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <TimezoneEditor
          current={profile.timezone}
          onSave={(tz) => {
            handleSaveField(prefix.MATRIX_UNSTABLE_PROFILE_TIMEZONE_PROPERTY_NAME, tz);
            handleSaveField(prefix.MATRIX_STABLE_PROFILE_TIMEZONE_PROPERTY_NAME, tz);
          }}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <BioEditor
          value={
            (
              profile.extended?.[prefix.MATRIX_UNSTABLE_PROFILE_BIOGRAPHY_PROPERTY_NAME] as
                | MSC4440Bio
                | undefined
            )?.['m.text']?.[0]?.body ||
            (profile.extended?.[prefix.MATRIX_SABLE_UNSTABLE_PROFILE_BIOGRAPHY_PROPERTY_NAME] as
              | string
              | undefined) ||
            (profile.extended?.[prefix.MATRIX_COMMET_UNSTABLE_PROFILE_BIO_PROPERTY_NAME] as
              | string
              | undefined) ||
            profile.bio
          }
          onSave={(htmlBio, plainTextBio) => {
            handleSaveField(prefix.MATRIX_SABLE_UNSTABLE_PROFILE_BIOGRAPHY_PROPERTY_NAME, htmlBio);

            // MSC4440
            handleSaveField(prefix.MATRIX_UNSTABLE_PROFILE_BIOGRAPHY_PROPERTY_NAME, {
              'm.text': [
                {
                  body: htmlBio,
                  mimetype: 'text/html',
                } satisfies MSC1767Text,
                {
                  body: plainTextBio,
                } satisfies MSC1767Text,
              ],
            } satisfies MSC4440Bio);

            const cleanedHtml = htmlBio.replaceAll('<br/></blockquote>', '</blockquote>');
            handleSaveField(prefix.MATRIX_COMMET_UNSTABLE_PROFILE_BIO_PROPERTY_NAME, {
              format: 'org.matrix.custom.html',
              formatted_body: cleanedHtml,
            });
          }}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <NameColorEditor
          title="Background Color"
          description="The background color that will be used when making your profile card"
          focusId="user-hero-color"
          current={profile?.heroColorScheme?.color}
          onSave={(color) =>
            handleSaveField(prefix.MATRIX_COMMET_UNSTABLE_PROFILE_COLOR_SCHEME_PROPERTY_NAME, {
              color,
              brightness: color ? profile?.heroColorScheme?.brightness : null,
            })
          }
        />
        <IconButton
          variant={profile?.heroColorScheme?.brightness === 'dark' ? 'Primary' : 'Warning'}
          onClick={() =>
            handleSaveField(prefix.MATRIX_COMMET_UNSTABLE_PROFILE_COLOR_SCHEME_PROPERTY_NAME, {
              color: profile?.heroColorScheme?.color,
              brightness: profile?.heroColorScheme?.brightness === 'dark' ? 'light' : 'dark',
            })
          }
        >
          <Box gap="200" direction="Row">
            <Text truncate>
              {profile?.heroColorScheme?.brightness === 'dark' ? 'Dark Mode' : 'Light Mode'}
            </Text>
            {profile?.heroColorScheme?.brightness === 'dark'
              ? menuIcon(Star, { weight: 'fill' })
              : menuIcon(Sun)}
          </Box>
        </IconButton>
      </SequenceCard>

      {extendedFields.length > 0 &&
        extendedFields.map(([key, value]) => {
          if (
            typeof value !== 'string' &&
            typeof value !== 'number' &&
            typeof value !== 'boolean'
          ) {
            return null;
          }

          const strVal = String(value);
          if (
            (typeof value !== 'string' &&
              typeof value !== 'number' &&
              typeof value !== 'boolean') ||
            strVal.length > 256
          ) {
            return null;
          }

          return (
            <SequenceCard
              key={key}
              className={SequenceCardStyle}
              variant="SurfaceVariant"
              direction="Column"
              gap="400"
            >
              <SettingTile
                key={key}
                focusId={`profile-field-${toSettingsFocusIdPart(key)}`}
                showSettingLinkAction={false}
                title={key.split('.').pop() || key}
                description={key}
                after={
                  <Text
                    size="T300"
                    style={{
                      maxWidth: '40vw',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {strVal}
                  </Text>
                }
              />
            </SequenceCard>
          );
        })}
    </Box>
  );
}

export function Profile() {
  const mx = useMatrixClient();
  const userId = mx.getUserId()!;
  const profile = useUserProfile(userId);
  const { unstable_features: unstableFeatures } = useSpecVersions();
  const supportsProfileChangePropagation =
    unstableFeatures?.[prefix.MATRIX_UNSTABLE_MSC4466_FEATURE] === true;
  const [profileChangePropagation] = useSetting(settingsAtom, 'profileChangePropagation');
  const propagateTo: ProfileChangePropagation | undefined = supportsProfileChangePropagation
    ? profileChangePropagation
    : undefined;
  return (
    <Box direction="Column" gap="700">
      <Box direction="Column" gap="100">
        <Text size="L400">Profile</Text>
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <ProfileBanner profile={profile} userId={userId} />
        </SequenceCard>
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <ProfileAvatar userId={userId} profile={profile} propagateTo={propagateTo} />
        </SequenceCard>
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <ProfileDisplayName userId={userId} profile={profile} propagateTo={propagateTo} />
        </SequenceCard>
        <ProfileChangePropagationSetting disabled={!supportsProfileChangePropagation} />
      </Box>
      <ProfileExtended userId={userId} profile={profile} />
      <AnimalCosmetics userId={userId} profile={profile} />
    </Box>
  );
}
