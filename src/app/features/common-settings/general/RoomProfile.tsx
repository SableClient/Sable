import {
  Avatar,
  Box,
  Button,
  Chip,
  color,
  config,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  TextArea,
} from 'folds';
import type { FormEventHandler } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import Linkify from 'linkify-react';
import classNames from 'classnames';
import type { MatrixError, StateEvents } from '$types/matrix-sdk';
import { JoinRule, EventType } from '$types/matrix-sdk';
import { SequenceCard } from '$components/sequence-card';
import { SequenceCardStyle } from '$features/room-settings/styles.css';
import { useRoom } from '$hooks/useRoom';
import { useRoomAvatar, useRoomJoinRule, useRoomName, useRoomTopic } from '$hooks/useRoomMeta';
import { mDirectAtom } from '$state/mDirectList';
import { BreakWord, LineClamp3 } from '$styles/Text.css';
import { LINKIFY_OPTS } from '$plugins/react-custom-html-parser';
import { RoomAvatar, RoomIcon } from '$components/room-avatar';
import { mxcUrlToHttp } from '$utils/matrix';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';

import { CompactUploadCardRenderer } from '$components/upload-card';
import { useObjectURL } from '$hooks/useObjectURL';
import type { UploadSuccess } from '$state/upload';
import { createUploadAtom } from '$state/upload';
import { useFilePicker } from '$hooks/useFilePicker';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useAlive } from '$hooks/useAlive';
import type { RoomPermissionsAPI } from '$hooks/useRoomPermissions';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useStateEvent } from '$hooks/useStateEvent';
import type { RoomBannerContent } from '$types/matrix-sdk-events';
import { CustomStateEvent } from '$types/matrix/room';
import { SettingTile } from '$components/setting-tile';
import { stopPropagation } from '$utils/keyboard';
import FocusTrap from 'focus-trap-react';

type RoomProfileEditProps = {
  canEditAvatar: boolean;
  canEditName: boolean;
  canEditTopic: boolean;
  avatar?: string;
  name: string;
  topic: string;
  isDm: boolean;
  onClose: () => void;
};
export function RoomProfileEdit({
  canEditAvatar,
  canEditName,
  canEditTopic,
  avatar,
  name,
  topic,
  isDm,
  onClose,
}: RoomProfileEditProps) {
  const room = useRoom();
  const mx = useMatrixClient();
  const alive = useAlive();
  const useAuthentication = useMediaAuthentication();
  const joinRule = useRoomJoinRule(room);
  const [roomAvatar, setRoomAvatar] = useState(avatar);

  const avatarUrl = roomAvatar
    ? (mxcUrlToHttp(mx, roomAvatar, useAuthentication) ?? undefined)
    : undefined;

  const [imageFile, setImageFile] = useState<File>();
  const avatarFileUrl = useObjectURL(imageFile);
  const uploadingAvatar = avatarFileUrl ? roomAvatar === avatar : false;
  const uploadAtom = useMemo(() => {
    if (imageFile) return createUploadAtom(imageFile);
    return undefined;
  }, [imageFile]);

  const pickFile = useFilePicker(setImageFile, false);

  const handleRemoveUpload = useCallback(() => {
    setImageFile(undefined);
    setRoomAvatar(avatar);
  }, [avatar]);

  const handleUploaded = useCallback((upload: UploadSuccess) => {
    setRoomAvatar(upload.mxc);
  }, []);

  const [submitState, submit] = useAsyncCallback(
    useCallback(
      async (roomAvatarMxc?: string | null, roomName?: string, roomTopic?: string) => {
        if (roomAvatarMxc !== undefined) {
          await mx.sendStateEvent(
            room.roomId,
            EventType.RoomAvatar as keyof StateEvents,
            roomAvatarMxc ? { url: roomAvatarMxc } : {}
          );
        }
        if (roomName !== undefined) {
          await mx.sendStateEvent(room.roomId, EventType.RoomName as keyof StateEvents, {
            name: roomName,
          });
        }
        if (roomTopic !== undefined) {
          await mx.sendStateEvent(room.roomId, EventType.RoomTopic as keyof StateEvents, {
            topic: roomTopic,
          });
        }
      },
      [mx, room.roomId]
    )
  );
  const submitting = submitState.status === AsyncStatus.Loading;

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (uploadingAvatar) return;

    const target = evt.target as HTMLFormElement | undefined;
    const nameInput = target?.nameInput as HTMLInputElement | undefined;
    const topicTextArea = target?.topicTextArea as HTMLTextAreaElement | undefined;
    if (!nameInput || !topicTextArea) return;

    const roomName = nameInput.value.trim();
    const roomTopic = topicTextArea.value.trim();

    if (roomAvatar === avatar && roomName === name && roomTopic === topic) {
      return;
    }

    submit(
      roomAvatar === avatar ? undefined : roomAvatar || null,
      roomName === name ? undefined : roomName,
      roomTopic === topic ? undefined : roomTopic
    ).then(() => {
      if (alive()) {
        onClose();
      }
    });
  };

  const handleResetName = useCallback(() => {
    submit(undefined, '', undefined).then(() => {
      if (alive()) {
        onClose();
      }
    });
  }, [submit, alive, onClose]);

  return (
    <Box as="form" onSubmit={handleSubmit} direction="Column" gap="400">
      <Box gap="400">
        <Box grow="Yes" direction="Column" gap="100">
          <Text size="L400">Avatar</Text>
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
                type="button"
                size="300"
                variant="Secondary"
                fill="Soft"
                radii="300"
                disabled={!canEditAvatar || submitting}
                onClick={() => pickFile('image/*')}
              >
                <Text size="B300">Upload</Text>
              </Button>
              {!roomAvatar && avatar && (
                <Button
                  type="button"
                  size="300"
                  variant="Success"
                  fill="None"
                  radii="300"
                  disabled={!canEditAvatar || submitting}
                  onClick={() => setRoomAvatar(avatar)}
                >
                  <Text size="B300">Reset</Text>
                </Button>
              )}
              {roomAvatar && (
                <Button
                  type="button"
                  size="300"
                  variant="Critical"
                  fill="None"
                  radii="300"
                  disabled={!canEditAvatar || submitting}
                  onClick={() => setRoomAvatar(undefined)}
                >
                  <Text size="B300">Remove</Text>
                </Button>
              )}
            </Box>
          )}
        </Box>
        <Box shrink="No">
          <Avatar size="500" radii="300">
            <RoomAvatar
              roomId={room.roomId}
              src={avatarUrl}
              alt={name}
              renderFallback={() => (
                <RoomIcon
                  roomType={room.getType()}
                  size="400"
                  joinRule={joinRule?.join_rule ?? JoinRule.Invite}
                  filled
                />
              )}
            />
          </Avatar>
        </Box>
      </Box>
      <Box direction="Column" gap="100">
        <Text size="L400">Name</Text>
        <Box gap="200" alignItems="Center">
          <Box grow="Yes">
            <Input
              name="nameInput"
              defaultValue={name}
              variant="Secondary"
              radii="300"
              style={{ width: '100%' }}
              readOnly={!canEditName || submitting}
            />
          </Box>

          {isDm && canEditName && (
            <Button
              type="button"
              variant="Critical"
              fill="None"
              size="300"
              radii="300"
              onClick={handleResetName}
              disabled={submitting}
              title="Reset DM Name"
            >
              <Icon src={Icons.Reload} size="100" />
            </Button>
          )}
        </Box>
      </Box>
      <Box direction="Inherit" gap="100">
        <Text size="L400">Topic</Text>
        <TextArea
          name="topicTextArea"
          defaultValue={topic}
          variant="Secondary"
          radii="300"
          readOnly={!canEditTopic || submitting}
        />
      </Box>
      {submitState.status === AsyncStatus.Error && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          {(submitState.error as MatrixError).message}
        </Text>
      )}
      <Box gap="300">
        <Button
          type="submit"
          variant="Success"
          size="300"
          radii="300"
          disabled={uploadingAvatar || submitting}
          before={submitting && <Spinner size="100" variant="Success" fill="Solid" />}
        >
          <Text size="B300">Save</Text>
        </Button>
        <Button
          type="reset"
          onClick={onClose}
          variant="Secondary"
          fill="Soft"
          size="300"
          radii="300"
        >
          <Text size="B300">Cancel</Text>
        </Button>
      </Box>
    </Box>
  );
}

export type ProfileProps = {
  bannerURI?: string;
};
function RoomBannerEdit({ bannerURI }: Readonly<ProfileProps>) {
  const mx = useMatrixClient();
  const [alertRemove, setAlertRemove] = useState(false);

  const space = useRoom();
  const [stagedUrl, setStagedUrl] = useState<string>();
  const [isRemoving, setIsRemoving] = useState(false);

  const bannerUrl = bannerURI;

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
      mx.sendStateEvent(space.roomId, CustomStateEvent.RoomBanner, { url: mxc }, '');
      setImageFile(undefined);
    },
    [mx, imageFileURL, space]
  );

  const handleRemoveBanner = async () => {
    setIsRemoving(true);
    setStagedUrl(undefined);
    setImageFile(undefined);

    mx.sendStateEvent(space.roomId, CustomStateEvent.RoomBanner, { url: '' }, '');

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

type RoomProfileProps = {
  permissions: RoomPermissionsAPI;
};
export function RoomProfile({ permissions }: RoomProfileProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const room = useRoom();
  const directs = useAtomValue(mDirectAtom);
  const isDm = directs.has(room.roomId);
  const [customDMCards] = useSetting(settingsAtom, 'customDMCards');

  const avatar = useRoomAvatar(room, directs.has(room.roomId) && !customDMCards);
  const name = useRoomName(room);
  const topic = useRoomTopic(room);
  const joinRule = useRoomJoinRule(room);

  const canEditAvatar = permissions.stateEvent(EventType.RoomAvatar, mx.getSafeUserId());
  const canEditName = permissions.stateEvent(EventType.RoomName, mx.getSafeUserId());
  const canEditTopic = permissions.stateEvent(EventType.RoomTopic, mx.getSafeUserId());
  const canEdit = canEditAvatar || canEditName || canEditTopic;

  const avatarUrl = avatar
    ? (mxcUrlToHttp(mx, avatar, useAuthentication, 96, 96, 'crop') ?? undefined)
    : undefined;

  const [edit, setEdit] = useState(false);

  const handleCloseEdit = useCallback(() => setEdit(false), []);

  const bannerState = useStateEvent(room, CustomStateEvent.RoomBanner);
  const bannerMXC = bannerState?.getContent<RoomBannerContent>()?.url;
  const bannerURI = mxcUrlToHttp(mx, bannerMXC ?? '', true);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Profile</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        {edit ? (
          <RoomProfileEdit
            canEditAvatar={canEditAvatar}
            canEditName={canEditName}
            canEditTopic={canEditTopic}
            avatar={avatar}
            name={name ?? ''}
            topic={topic ?? ''}
            isDm={isDm}
            onClose={handleCloseEdit}
          />
        ) : (
          <Box gap="400">
            <Box grow="Yes" direction="Column" gap="300">
              <Box direction="Column" gap="100">
                <Text className={BreakWord} size="H5">
                  {name ?? 'Unknown'}
                </Text>
                {topic && (
                  <Text className={classNames(BreakWord, LineClamp3)} size="T200">
                    <Linkify options={LINKIFY_OPTS}>{topic}</Linkify>
                  </Text>
                )}
              </Box>
              {canEdit && (
                <Box gap="200">
                  <Chip
                    variant="Secondary"
                    fill="Soft"
                    radii="300"
                    before={<Icon size="50" src={Icons.Pencil} />}
                    onClick={() => setEdit(true)}
                    outlined
                  >
                    <Text size="B300">Edit</Text>
                  </Chip>
                </Box>
              )}
            </Box>
            <Box shrink="No">
              <Avatar size="500" radii="300">
                <RoomAvatar
                  roomId={room.roomId}
                  src={avatarUrl}
                  alt={name}
                  renderFallback={() => (
                    <RoomIcon
                      roomType={room.getType()}
                      size="400"
                      joinRule={joinRule?.join_rule ?? JoinRule.Invite}
                      filled
                    />
                  )}
                />
              </Avatar>
            </Box>
          </Box>
        )}
      </SequenceCard>
      {room.isSpaceRoom() && (
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <RoomBannerEdit bannerURI={bannerURI ?? undefined} />
        </SequenceCard>
      )}
    </Box>
  );
}
