import {
  ChangeEvent,
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
  Scroll,
  Switch,
  Avatar,
  Input,
  config,
  Button,
  Spinner,
  OverlayBackdrop,
  Overlay,
  OverlayCenter,
  Modal,
  Dialog,
  Header,
} from 'folds';
import { Page, PageContent, PageHeader } from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useRoom } from '$hooks/useRoom';
import { usePowerLevels } from '$hooks/usePowerLevels';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { StateEvent } from '$types/matrix/room';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { createLogger } from '$utils/debug';
import { SequenceCardStyle } from '$features/common-settings/styles.css';
import { UserAvatar } from '$components/user-avatar';
import { nameInitials } from '$utils/common';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { UserProfile, useUserProfile } from '$hooks/useUserProfile';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { Room, RoomMember } from '$types/matrix-sdk';
import { Command, useCommands } from '$hooks/useCommands';
import { useCapabilities } from '$hooks/useCapabilities';
import { useObjectURL } from '$hooks/useObjectURL';
import { createUploadAtom, UploadSuccess } from '$state/upload';
import { useFilePicker } from '$hooks/useFilePicker';
import { CompactUploadCardRenderer } from '$components/upload-card';
import FocusTrap from 'focus-trap-react';
import { ImageEditor } from '$components/image-editor';
import { stopPropagation } from '$utils/keyboard';
import { ModalWide } from '$styles/Modal.css';
import { NameColorEditor } from '$features/settings/account/NameColorEditor';
import { PronounEditor, PronounSet } from '$features/settings/account/PronounEditor';

const log = createLogger('Cosmetics');

type CosmeticsSettingProps = {
  profile: UserProfile;
  member: RoomMember;
  userId: string;
  room: Room;
};
export function CosmeticsAvatar({ profile, member, userId, room }: CosmeticsSettingProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const capabilities = useCapabilities();
  const [alertRemove, setAlertRemove] = useState(false);
  const disableSetAvatar = capabilities['m.set_avatar_url']?.enabled === false;

  const avatarMxc = member.getMxcAvatarUrl();
  const avatarUrl =
    avatarMxc && (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined);

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

  const myRoomAvatar = useCommands(mx, room)[Command.MyRoomAvatar];
  const handleUploaded = useCallback(
    (upload: UploadSuccess) => {
      const { mxc } = upload;
      myRoomAvatar.exe(mxc);
      handleRemoveUpload();
    },
    [myRoomAvatar, handleRemoveUpload]
  );

  const handleRemoveAvatar = () => {
    myRoomAvatar.exe('');
    setAlertRemove(false);
  };

  return (
    <SettingTile
      title="Room Avatar"
      after={
        <Avatar size="500" radii="300">
          <UserAvatar
            userId={userId}
            src={avatarUrl}
            renderFallback={() => (
              <Text size="H4">{nameInitials(room.getMember(userId)!.rawDisplayName)}</Text>
            )}
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
          {avatarUrl &&
            avatarUrl !==
              mxcUrlToHttp(mx, profile.avatarUrl ?? '', useAuthentication, 96, 96, 'crop') && (
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
                  <Text size="H4">Remove Room Avatar</Text>
                </Box>
                <IconButton size="300" onClick={() => setAlertRemove(false)} radii="300">
                  <Icon src={Icons.Cross} />
                </IconButton>
              </Header>
              <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                <Box direction="Column" gap="200">
                  <Text priority="400">Are you sure you want to remove room avatar?</Text>
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

export function CosmeticsNickname({ profile, member, userId, room }: CosmeticsSettingProps) {
  const mx = useMatrixClient();

  const defaultDisplayName = member.rawDisplayName;
  const [displayName, setDisplayName] = useState<string>(defaultDisplayName);
  const hasChanges = displayName !== defaultDisplayName;

  const myRoomNick = useCommands(mx, room)[Command.MyRoomNick];
  const [changeState, changeDisplayName] = useAsyncCallback((name: string) => myRoomNick.exe(name));
  const changingDisplayName = changeState.status === AsyncStatus.Loading;

  useEffect(() => {
    setDisplayName(defaultDisplayName);
  }, [defaultDisplayName]);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const name = evt.currentTarget.value;
    setDisplayName(name);
  };

  const handleReset = () => {
    if (hasChanges) {
      setDisplayName(defaultDisplayName);
    } else {
      setDisplayName(profile.displayName ?? getMxIdLocalPart(userId) ?? userId);
    }
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (changingDisplayName) return;

    const target = evt.target as HTMLFormElement | undefined;
    const displayNameInput = target?.displayNameInput as HTMLInputElement | undefined;
    const name = displayNameInput?.value;

    changeDisplayName(name ?? '');
  };

  return (
    <SettingTile title="Room Display Name">
      <Box direction="Column" grow="Yes" gap="100">
        <Box as="form" onSubmit={handleSubmit} gap="200">
          <Box grow="Yes" direction="Column">
            <Input
              name="displayNameInput"
              value={displayName}
              onChange={handleChange}
              variant="Secondary"
              radii="300"
              style={{ paddingRight: config.space.S200 }}
              readOnly={changingDisplayName}
              after={
                displayName !== (profile.displayName ?? getMxIdLocalPart(userId) ?? userId) &&
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

export function CosmeticsFont({
  room,
  isSpace,
  font,
  disabled,
}: {
  room: Room;
  isSpace: boolean;
  font?: string;
  disabled: boolean;
}) {
  const mx = useMatrixClient();

  const initialFont = (/^"?(.*?)"?, var\(--font-secondary\)$/.exec(font ?? '') ?? [''])[1];
  const [val, setVal] = useState(initialFont);

  useEffect(() => setVal(initialFont), [initialFont]);

  const fontCommand = useCommands(mx, room)[isSpace ? Command.SFont : Command.Font];
  const handleSave = () => {
    if (val === initialFont) return;
    fontCommand.exe(val);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setVal(e.currentTarget.value);
  };

  return (
    <SettingTile
      title={isSpace ? 'Space Font' : 'Room Font'}
      description="Use a custom font to render your display name"
      after={
        <Input
          value={val}
          size="300"
          radii="300"
          disabled={disabled}
          variant="Secondary"
          placeholder="Comic Sans"
          onChange={handleChange}
          onBlur={handleSave}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          style={{ width: '232px' }}
        />
      }
    />
  );
}

type CosmeticsProps = {
  requestClose: () => void;
};
export function Cosmetics({ requestClose }: CosmeticsProps) {
  const mx = useMatrixClient();
  const userId = mx.getUserId()!;
  const profile = useUserProfile(userId);
  const room = useRoom();
  const roomProfile = useUserProfile(userId, room);
  const creators = useRoomCreators(room);
  const member = room.getMember(userId)!;
  const powerLevels = usePowerLevels(room);
  const isSpace = room.isSpaceRoom();

  const permissions = useRoomPermissions(creators, powerLevels);
  const canEditPermissions = permissions.stateEvent(StateEvent.RoomPowerLevels, mx.getSafeUserId());

  const commands = useCommands(mx, room);

  const getLevel = (eventType: string) => (powerLevels as any).events?.[eventType] ?? 50;

  const canHaveRoomColor = getLevel(StateEvent.RoomCosmeticsColor) === 0;
  const canHaveRoomPronouns = getLevel(StateEvent.RoomCosmeticsPronouns) === 0;
  const canHaveRoomFont = getLevel(StateEvent.RoomCosmeticsFont) === 0;

  const handleToggle = useCallback(
    async (eventType: string, enabled: boolean) => {
      const newLevel = enabled ? 0 : 50;
      const newContent = {
        ...powerLevels,
        events: {
          ...((powerLevels as any).events || {}),
          [eventType]: newLevel,
        },
      };

      try {
        await mx.sendStateEvent(room.roomId, StateEvent.RoomPowerLevels as any, newContent, '');
      } catch (e) {
        log.error(`Failed to update permissions for ${eventType}:`, e);
      }
    },
    [mx, room.roomId, powerLevels]
  );

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Cosmetics
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
                <Text size="L400">Profile</Text>
                {!isSpace && (
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <CosmeticsAvatar
                      profile={profile}
                      member={member}
                      userId={userId}
                      room={room}
                    />
                  </SequenceCard>
                )}
                {!isSpace && (
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <CosmeticsNickname
                      profile={profile}
                      member={member}
                      userId={userId}
                      room={room}
                    />
                  </SequenceCard>
                )}
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <NameColorEditor
                    title={isSpace ? 'Space Name Color' : 'Room Name Color'}
                    current={roomProfile.resolvedColor}
                    disabled={!(canHaveRoomColor || canEditPermissions)}
                    onSave={(color) =>
                      commands[isSpace ? Command.SColor : Command.Color].exe(color ?? 'clear')
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
                    title={isSpace ? 'Space Pronouns' : 'Room Pronouns'}
                    current={roomProfile.resolvedPronouns as any}
                    disabled={!(canHaveRoomPronouns || canEditPermissions)}
                    onSave={(p) =>
                      commands[isSpace ? Command.SPronoun : Command.Pronoun].exe(
                        p
                          .map(({ language, summary }: PronounSet) =>
                            language ? `${language}:${summary}` : summary
                          )
                          .join()
                      )
                    }
                  />
                </SequenceCard>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <CosmeticsFont
                    room={room}
                    isSpace={isSpace}
                    font={roomProfile.resolvedFont}
                    disabled={!(canHaveRoomFont || canEditPermissions)}
                  />
                </SequenceCard>
              </Box>
              <Box direction="Column" gap="100">
                <Text size="L400">Settings</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title={isSpace ? 'Space-Wide Colors' : 'Room Colors'}
                    description={`Allow everyone to set a color that applies in ${isSpace ? "all the space's rooms" : 'this room'}.`}
                    after={
                      <Switch
                        variant="Primary"
                        value={canHaveRoomColor}
                        onChange={(enabled) => handleToggle(StateEvent.RoomCosmeticsColor, enabled)}
                        disabled={!canEditPermissions}
                      />
                    }
                  />
                </SequenceCard>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title={isSpace ? 'Space-Wide Pronouns' : 'Room Pronouns'}
                    description={`Allow everyone to set pronouns that apply in ${isSpace ? "all the space's rooms" : 'this room'}.`}
                    after={
                      <Switch
                        variant="Primary"
                        value={canHaveRoomPronouns}
                        onChange={(enabled) =>
                          handleToggle(StateEvent.RoomCosmeticsPronouns, enabled)
                        }
                        disabled={!canEditPermissions}
                      />
                    }
                  />
                </SequenceCard>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title={isSpace ? 'Space-Wide Fonts' : 'Room Fonts'}
                    description={`Allow everyone to set a font that applies in ${isSpace ? "all the space's rooms" : 'this room'}.`}
                    after={
                      <Switch
                        variant="Primary"
                        value={canHaveRoomFont}
                        onChange={(enabled) => handleToggle(StateEvent.RoomCosmeticsFont, enabled)}
                        disabled={!canEditPermissions}
                      />
                    }
                  />
                </SequenceCard>
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
