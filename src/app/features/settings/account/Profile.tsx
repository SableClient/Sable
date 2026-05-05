import type { ChangeEventHandler, FormEventHandler } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Text,
  IconButton,
  Icon,
  Icons,
  Input,
  Avatar,
  Button,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Modal,
  Dialog,
  Header,
  config,
  Spinner,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { useSetAtom } from 'jotai';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { UserProfile, MSC4440Bio } from '$hooks/useUserProfile';
import { useUserProfile } from '$hooks/useUserProfile';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { UserAvatar } from '$components/user-avatar';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { nameInitials } from '$utils/common';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useFilePicker } from '$hooks/useFilePicker';
import { useObjectURL } from '$hooks/useObjectURL';
import { stopPropagation } from '$utils/keyboard';
import { toSettingsFocusIdPart } from '$features/settings/settingsLink';
import { ImageEditor } from '$components/image-editor';
import { ModalWide } from '$styles/Modal.css';
import type { UploadSuccess } from '$state/upload';
import { createUploadAtom } from '$state/upload';
import { CompactUploadCardRenderer } from '$components/upload-card';
import { useCapabilities } from '$hooks/useCapabilities';
import { profilesCacheAtom } from '$state/userRoomProfile';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { useUserPresence } from '$hooks/useUserPresence';
import type { MSC1767Text } from '$types/matrix/common';
import { TimezoneEditor } from './TimezoneEditor';
import { PronounEditor } from './PronounEditor';
import { BioEditor } from './BioEditor';
import { NameColorEditor } from './NameColorEditor';
import { StatusEditor } from './StatusEditor';
import { AnimalCosmetics } from './AnimalCosmetics';
import * as prefix from '$unstable/prefixes';

type PronounSet = {
  summary: string;
  language?: string;
};

type ProfileProps = {
  profile: UserProfile;
  userId: string;
};
function ProfileAvatar({ profile, userId }: Readonly<ProfileProps>) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const capabilities = useCapabilities();
  const [alertRemove, setAlertRemove] = useState(false);
  const disableSetAvatar = capabilities['m.set_avatar_url']?.enabled === false;

  const defaultDisplayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? (mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined)
    : undefined;

  const [imageFile, setImageFile] = useState<File>();
  const imageFileURL = useObjectURL(imageFile);
  const uploadAtom = useMemo(() => {
    if (imageFile) return createUploadAtom(imageFile);
    return undefined;
  }, [imageFile]);

  const pickFile = useFilePicker(setImageFile, false);

  const handleRemoveUpload = useCallback(() => {
    setImageFile(undefined);
  }, []);

  const handleUploaded = useCallback(
    (upload: UploadSuccess) => {
      const { mxc } = upload;
      mx.setAvatarUrl(mxc);
      handleRemoveUpload();
    },
    [mx, handleRemoveUpload]
  );

  const handleRemoveAvatar = () => {
    mx.setAvatarUrl('');
    setAlertRemove(false);
  };

  return (
    <SettingTile
      title="Avatar"
      focusId="avatar"
      after={
        <Avatar size="500" radii="300">
          <UserAvatar
            userId={userId}
            src={avatarUrl}
            renderFallback={() => <Text size="H4">{nameInitials(defaultDisplayName)}</Text>}
          />
        </Avatar>
      }
    >
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
            onClick={() => pickFile('image/*')}
            size="300"
            variant="Secondary"
            fill="Soft"
            outlined
            radii="300"
            disabled={disableSetAvatar}
          >
            <Text size="B300">Upload</Text>
          </Button>
          {avatarUrl && (
            <Button
              size="300"
              variant="Critical"
              fill="None"
              radii="300"
              disabled={disableSetAvatar}
              onClick={() => setAlertRemove(true)}
            >
              <Text size="B300">Remove</Text>
            </Button>
          )}
        </Box>
      )}

      {imageFileURL && (
        <Overlay open={false} backdrop={<OverlayBackdrop />}>
          <OverlayCenter>
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                onDeactivate: handleRemoveUpload,
                clickOutsideDeactivates: true,
                escapeDeactivates: stopPropagation,
              }}
            >
              <Modal className={ModalWide} variant="Surface" size="500">
                <ImageEditor
                  name={imageFile?.name ?? 'Unnamed'}
                  url={imageFileURL}
                  requestClose={handleRemoveUpload}
                />
              </Modal>
            </FocusTrap>
          </OverlayCenter>
        </Overlay>
      )}

      <Overlay open={alertRemove} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setAlertRemove(false),
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
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
                  <Text size="H4">Remove Avatar</Text>
                </Box>
                <IconButton size="300" onClick={() => setAlertRemove(false)} radii="300">
                  <Icon src={Icons.Cross} />
                </IconButton>
              </Header>
              <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                <Box direction="Column" gap="200">
                  <Text priority="400">Are you sure you want to remove profile avatar?</Text>
                </Box>
                <Button variant="Critical" onClick={handleRemoveAvatar}>
                  <Text size="B400">Remove</Text>
                </Button>
              </Box>
            </Dialog>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
    </SettingTile>
  );
}

function ProfileBanner({ profile }: Readonly<Pick<ProfileProps, 'profile'>>) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [alertRemove, setAlertRemove] = useState(false);

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
    (upload: UploadSuccess) => {
      const { mxc } = upload;

      if (imageFileURL) setStagedUrl(imageFileURL);

      mx.setExtendedProfileProperty?.(prefix.MATRIX_UNSTABLE_PROFILE_BANNER_PROPERTY_NAME, mxc);
      setImageFile(undefined);
    },
    [mx, imageFileURL]
  );

  const handleRemoveBanner = async () => {
    setIsRemoving(true);
    setStagedUrl(undefined);
    setImageFile(undefined);

    await mx.setExtendedProfileProperty?.(
      prefix.MATRIX_UNSTABLE_PROFILE_BANNER_PROPERTY_NAME,
      null
    );

    setAlertRemove(false);
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
            <img
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
                onClick={() => setAlertRemove(true)}
              >
                <Text size="B300">Remove</Text>
              </Button>
            )}
          </Box>
        )}
      </Box>

      <Overlay open={alertRemove} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setAlertRemove(false),
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
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
                  <Text size="H4">Remove Banner</Text>
                </Box>
                <IconButton size="300" onClick={() => setAlertRemove(false)} radii="300">
                  <Icon src={Icons.Cross} />
                </IconButton>
              </Header>
              <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                <Text priority="400">Are you sure you want to remove profile banner?</Text>
                <Button variant="Critical" onClick={handleRemoveBanner}>
                  <Text size="B400">Remove</Text>
                </Button>
              </Box>
            </Dialog>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
    </SettingTile>
  );
}

function ProfileDisplayName({ profile, userId }: Readonly<ProfileProps>) {
  const mx = useMatrixClient();
  const capabilities = useCapabilities();
  const disableSetDisplayname = capabilities['m.set_displayname']?.enabled === false;

  const defaultDisplayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const [displayName, setDisplayName] = useState(defaultDisplayName);

  const [changeState, changeDisplayName] = useAsyncCallback(
    useCallback((name: string) => mx.setDisplayName(name), [mx])
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
                    <Icon src={Icons.Cross} size="100" />
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
  ]);

  // Unknown fields / unimplemented non-matrix-spec fields
  // Only renders them, can't edit or set
  const extendedFields = Object.entries(profile.extended || {}).filter(
    ([key]) => !EXCLUDED_KEYS.has(key)
  );

  const handleSaveField = useCallback(
    async (key: string, value: unknown) => {
      await mx.setExtendedProfileProperty?.(key, value);
      setGlobalProfiles((prev) => {
        const newCache = { ...prev };
        delete newCache[userId];
        return newCache;
      });
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
          title="General Global Name Color"
          description="Custom name color everywhere names have color!"
          focusId="name-color"
          current={
            profile.nameColor ||
            (profile.extended?.[prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_PROPERTY_NAME] as
              | string
              | undefined)
          }
          onSave={(color) =>
            handleSaveField(prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_PROPERTY_NAME, color)
          }
        />
        <NameColorEditor
          title="Dark theme Global Name Color"
          description="Your name's color for a dark theme user."
          focusId="name-color-dark-theme"
          current={
            profile.nameColorDark ||
            (profile.extended?.[prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_DARK_PROPERTY_NAME] as
              | string
              | undefined)
          }
          onSave={(color) =>
            handleSaveField(prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_DARK_PROPERTY_NAME, color)
          }
        />
        <NameColorEditor
          title="Light theme Global Name Color"
          description="Your name's color for a light theme user."
          focusId="name-color-light-theme"
          current={
            profile.nameColorLight ||
            (profile.extended?.[prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_LIGHT_PROPERTY_NAME] as
              | string
              | undefined)
          }
          onSave={(color) =>
            handleSaveField(prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_LIGHT_PROPERTY_NAME, color)
          }
        />
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
            <Icon
              src={profile?.heroColorScheme?.brightness === 'dark' ? Icons.Star : Icons.Sun}
              size="200"
            />
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
                  <Text size="T300" truncate>
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
          <ProfileBanner profile={profile} />
        </SequenceCard>
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <ProfileAvatar userId={userId} profile={profile} />
        </SequenceCard>
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <ProfileDisplayName userId={userId} profile={profile} />
        </SequenceCard>
      </Box>
      <ProfileExtended userId={userId} profile={profile} />
      <AnimalCosmetics userId={userId} profile={profile} />
    </Box>
  );
}
