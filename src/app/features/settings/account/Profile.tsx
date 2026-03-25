import {
  ChangeEventHandler,
  FormEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
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
import { UserProfile, useUserProfile } from '$hooks/useUserProfile';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { UserAvatar } from '$components/user-avatar';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { nameInitials } from '$utils/common';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useFilePicker } from '$hooks/useFilePicker';
import { useObjectURL } from '$hooks/useObjectURL';
import { stopPropagation } from '$utils/keyboard';
import { ImageEditor } from '$components/image-editor';
import { ModalWide } from '$styles/Modal.css';
import { createUploadAtom, UploadSuccess } from '$state/upload';
import { CompactUploadCardRenderer } from '$components/upload-card';
import { useCapabilities } from '$hooks/useCapabilities';
import { profilesCacheAtom } from '$state/userRoomProfile';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { useUserPresence } from '$hooks/useUserPresence';
import { TimezoneEditor } from './TimezoneEditor';
import { PronounEditor } from './PronounEditor';
import { BioEditor } from './BioEditor';
import { NameColorEditor } from './NameColorEditor';
import { StatusEditor } from './StatusEditor';
import { AnimalCosmetics } from './AnimalCosmetics';

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ProfileBanner({ profile, userId }: Readonly<ProfileProps>) {
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

      mx.setExtendedProfileProperty?.('chat.commet.profile_banner', mxc);
      setImageFile(undefined);
    },
    [mx, imageFileURL]
  );

  const handleRemoveBanner = async () => {
    setIsRemoving(true);
    setStagedUrl(undefined);
    setImageFile(undefined);

    await mx.setExtendedProfileProperty?.('chat.commet.profile_banner', null);

    setAlertRemove(false);
  };

  const previewUrl = isRemoving ? undefined : imageFileURL || stagedUrl || bannerUrl;

  return (
    <SettingTile title="Banner">
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
  const [displayName, setDisplayName] = useState<string>(defaultDisplayName);

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
    <SettingTile title="Display Name">
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
  const EXCLUDED_KEYS = new Set(['kitty.meow.is_cat', 'kitty.meow.has_cats']);

  // Unknown fields / unimplemented non-matrix-spec fields
  // Only renders them, can't edit or set
  const extendedFields = Object.entries(profile.extended || {}).filter(
    ([key]) => !EXCLUDED_KEYS.has(key)
  );

  const handleSaveField = useCallback(
    async (key: string, value: any) => {
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
          title="Global Name Color"
          description="Custom name color everywhere names have color!"
          current={profile.nameColor || profile.extended?.['moe.sable.app.name_color']}
          onSave={(color) => handleSaveField('moe.sable.app.name_color', color)}
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
          onSave={(p) => handleSaveField('io.fsky.nyx.pronouns', p)}
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
            handleSaveField('us.cloke.msc4175.tz', tz);
            handleSaveField('m.tz', tz);
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
            profile.extended?.['moe.sable.app.bio'] ||
            profile.extended?.['chat.commet.profile_bio'] ||
            profile.bio
          }
          onSave={(htmlBio) => {
            handleSaveField('moe.sable.app.bio', htmlBio);

            const cleanedHtml = htmlBio.replaceAll('<br/></blockquote>', '</blockquote>');
            handleSaveField('chat.commet.profile_bio', {
              format: 'org.matrix.custom.html',
              formatted_body: cleanedHtml,
            });
          }}
        />
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
              className={SequenceCardStyle}
              variant="SurfaceVariant"
              direction="Column"
              gap="400"
            >
              <SettingTile
                key={key}
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
          <ProfileBanner userId={userId} profile={profile} />
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
