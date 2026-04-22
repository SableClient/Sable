import {
  KeyboardEventHandler,
  MouseEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import FocusTrap from 'focus-trap-react';
import { isKeyHotkey } from 'is-hotkey';
import { Room } from '$types/matrix-sdk';
import {
  PopOut,
  Menu,
  MenuItem,
  config,
  Text,
  Line,
  Chip,
  Icon,
  Icons,
  RectCords,
  Spinner,
  toRem,
  Box,
  Scroll,
  Avatar,
} from 'folds';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useCloseUserRoomProfile } from '$state/hooks/userRoomProfile';
import { stopPropagation } from '$utils/keyboard';
import { copyToClipboard } from '$utils/dom';
import { getExploreServerPath } from '$pages/pathUtils';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { factoryRoomIdByAtoZ } from '$utils/sort';
import { useMutualRooms, useMutualRoomsSupport } from '$hooks/useMutualRooms';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { useDirectRooms } from '$pages/client/direct/useDirectRooms';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';
import { getDirectRoomAvatarUrl, getRoomAvatarUrl } from '$utils/room';
import { nameInitials } from '$utils/common';
import { getMatrixToUser } from '$plugins/matrix-to';
import { useTimeoutToggle } from '$hooks/useTimeoutToggle';
import { useIgnoredUsers } from '$hooks/useIgnoredUsers';
import { useNickname, useSetNickname } from '$hooks/useNickname';
import { CutoutCard } from '$components/cutout-card';
import { SettingTile } from '$components/setting-tile';
import { RoomAvatar, RoomIcon } from '$components/room-avatar';
import * as css from './styles.css';

export function ServerChip({
  server,
  innerColor,
  cardColor,
  textColor,
  backgroundColor,
}: {
  server: string;
  innerColor?: string;
  cardColor?: string;
  textColor?: string;
  backgroundColor?: string;
}) {
  const navigate = useNavigate();
  const closeProfile = useCloseUserRoomProfile();
  const [copied, setCopied] = useTimeoutToggle();

  const [cords, setCords] = useState<RectCords>();

  const open: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setCords(evt.currentTarget.getBoundingClientRect());
  };

  const close = () => setCords(undefined);

  return (
    <PopOut
      anchor={cords}
      position="Bottom"
      align="Start"
      offset={4}
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: close,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
            isKeyForward: (evt: KeyboardEvent) => isKeyHotkey('arrowdown', evt),
            isKeyBackward: (evt: KeyboardEvent) => isKeyHotkey('arrowup', evt),
          }}
        >
          <Menu>
            <div
              style={{
                padding: config.space.S100,
                maxWidth: toRem(200),
                backgroundColor: innerColor,
              }}
            >
              <MenuItem
                fill="None"
                size="300"
                radii="300"
                onClick={() => {
                  copyToClipboard(server);
                  setCopied();
                  close();
                }}
                style={{ backgroundColor: cardColor, color: textColor }}
              >
                <Text size="B300">Copy Server</Text>
              </MenuItem>
              <MenuItem
                fill="None"
                size="300"
                radii="300"
                onClick={() => {
                  navigate(getExploreServerPath(server));
                  closeProfile();
                }}
                style={{ backgroundColor: cardColor, color: textColor }}
              >
                <Text size="B300">Explore Community</Text>
              </MenuItem>
            </div>
            <Line size="300" />
            <div
              style={{ padding: config.space.S100, backgroundColor: cardColor, color: textColor }}
            >
              <MenuItem
                fill="None"
                size="300"
                radii="300"
                onClick={() => {
                  window.open(`https://${server}`, '_blank');
                  close();
                }}
                style={{ backgroundColor: cardColor, color: textColor }}
              >
                <Text size="B300">Open in Browser</Text>
              </MenuItem>
            </div>
          </Menu>
        </FocusTrap>
      }
    >
      <Chip
        radii="Pill"
        before={
          cords ? (
            <Icon size="50" src={Icons.ChevronBottom} />
          ) : (
            <Icon size="50" src={copied ? Icons.Check : Icons.Server} />
          )
        }
        onClick={open}
        aria-pressed={!!cords}
        className={css.UserHeroChip}
        style={{
          backgroundColor: cardColor,
          borderColor: backgroundColor,
          color: textColor,
        }}
      >
        <Text size="B300" truncate>
          {server}
        </Text>
      </Chip>
    </PopOut>
  );
}

export function ShareChip({
  userId,
  innerColor,
  cardColor,
  textColor,
  backgroundColor,
}: {
  userId: string;
  innerColor?: string;
  cardColor?: string;
  textColor?: string;
  backgroundColor?: string;
}) {
  const [cords, setCords] = useState<RectCords>();

  const [copied, setCopied] = useTimeoutToggle();

  const open: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setCords(evt.currentTarget.getBoundingClientRect());
  };

  const close = () => setCords(undefined);

  return (
    <PopOut
      anchor={cords}
      position="Bottom"
      align="Start"
      offset={4}
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: close,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
            isKeyForward: (evt: KeyboardEvent) => isKeyHotkey('arrowdown', evt),
            isKeyBackward: (evt: KeyboardEvent) => isKeyHotkey('arrowup', evt),
          }}
        >
          <Menu>
            <div style={{ padding: config.space.S100, backgroundColor: innerColor }}>
              <MenuItem
                fill="None"
                size="300"
                radii="300"
                style={{ backgroundColor: cardColor, color: textColor }}
                onClick={() => {
                  copyToClipboard(userId);
                  setCopied();
                  close();
                }}
              >
                <Text size="B300">Copy User ID</Text>
              </MenuItem>
              <MenuItem
                fill="None"
                size="300"
                radii="300"
                style={{ backgroundColor: cardColor, color: textColor }}
                onClick={() => {
                  copyToClipboard(getMatrixToUser(userId));
                  setCopied();
                  close();
                }}
              >
                <Text size="B300">Copy User Link</Text>
              </MenuItem>
            </div>
          </Menu>
        </FocusTrap>
      }
    >
      <Chip
        variant={copied ? 'Success' : undefined}
        radii="Pill"
        before={
          cords ? (
            <Icon size="50" src={Icons.ChevronBottom} />
          ) : (
            <Icon size="50" src={copied ? Icons.Check : Icons.Link} />
          )
        }
        onClick={open}
        aria-pressed={!!cords}
        className={css.UserHeroChip}
        style={{
          backgroundColor: (!copied && cardColor) || undefined,
          borderColor: backgroundColor,
          color: textColor,
        }}
      >
        <Text size="B300" truncate>
          Share
        </Text>
      </Chip>
    </PopOut>
  );
}

type MutualRoomsData = {
  rooms: Room[];
  spaces: Room[];
  directs: Room[];
};

export function MutualRoomsChip({
  userId,
  backgroundColor,
  innerColor,
  cardColor,
  textColor,
}: {
  userId: string;
  backgroundColor?: string;
  innerColor?: string;
  cardColor?: string;
  textColor?: string;
}) {
  const mx = useMatrixClient();
  const mutualRoomSupported = useMutualRoomsSupport();
  const mutualRoomsState = useMutualRooms(userId);
  const { navigateRoom, navigateSpace } = useRoomNavigate();
  const closeUserRoomProfile = useCloseUserRoomProfile();
  const directs = useDirectRooms();
  const useAuthentication = useMediaAuthentication();

  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);

  const [cords, setCords] = useState<RectCords>();

  const open: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setCords(evt.currentTarget.getBoundingClientRect());
  };

  const close = () => setCords(undefined);

  const mutual: MutualRoomsData = useMemo(() => {
    const data: MutualRoomsData = {
      rooms: [],
      spaces: [],
      directs: [],
    };

    if (mutualRoomsState.status === AsyncStatus.Success) {
      const mutualRooms = mutualRoomsState.data
        .sort(factoryRoomIdByAtoZ(mx))
        .map(getRoom)
        .filter((room) => !!room);
      mutualRooms.forEach((room) => {
        if (room.isSpaceRoom()) {
          data.spaces.push(room);
          return;
        }
        if (directs.includes(room.roomId)) {
          data.directs.push(room);
          return;
        }
        data.rooms.push(room);
      });
    }
    return data;
  }, [mutualRoomsState, getRoom, directs, mx]);

  if (
    userId === mx.getSafeUserId() ||
    !mutualRoomSupported ||
    mutualRoomsState.status === AsyncStatus.Error
  ) {
    return null;
  }

  const renderItem = (room: Room) => {
    const { roomId } = room;
    const dm = directs.includes(roomId);

    return (
      <MenuItem
        key={roomId}
        variant="Surface"
        fill="None"
        size="300"
        radii="300"
        style={{ paddingLeft: config.space.S100, backgroundColor: cardColor, color: textColor }}
        onClick={() => {
          if (room.isSpaceRoom()) {
            navigateSpace(roomId);
          } else {
            navigateRoom(roomId);
          }
          closeUserRoomProfile();
        }}
        before={
          <Avatar size="200" radii={dm ? '400' : '300'}>
            {dm || room.isSpaceRoom() ? (
              <RoomAvatar
                roomId={room.roomId}
                src={
                  dm
                    ? getDirectRoomAvatarUrl(mx, room, 96, useAuthentication)
                    : getRoomAvatarUrl(mx, room, 96, useAuthentication)
                }
                alt={room.name}
                renderFallback={() => (
                  <Text as="span" size="H6">
                    {nameInitials(room.name)}
                  </Text>
                )}
              />
            ) : (
              <RoomIcon
                size="100"
                joinRule={room.getJoinRule()}
                roomType={room.getType()}
                style={{ color: textColor }}
              />
            )}
          </Avatar>
        }
      >
        <Text size="B300" truncate style={{ color: textColor }}>
          {room.name}
        </Text>
      </MenuItem>
    );
  };

  return (
    <PopOut
      anchor={cords}
      position="Bottom"
      align="Start"
      offset={4}
      content={
        mutualRoomsState.status === AsyncStatus.Success ? (
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: close,
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
              isKeyForward: (evt: KeyboardEvent) => isKeyHotkey('arrowdown', evt),
              isKeyBackward: (evt: KeyboardEvent) => isKeyHotkey('arrowup', evt),
            }}
          >
            <Menu
              style={{
                display: 'flex',
                maxWidth: toRem(200),
                maxHeight: '80vh',
                backgroundColor: innerColor,
              }}
            >
              <Box grow="Yes">
                <Scroll size="300" hideTrack>
                  <Box
                    direction="Column"
                    gap="400"
                    style={{ padding: config.space.S200, paddingRight: 0, color: textColor }}
                  >
                    {mutual.spaces.length > 0 && (
                      <Box direction="Column" gap="100">
                        <Text style={{ paddingLeft: config.space.S100 }} size="L400">
                          Spaces
                        </Text>
                        {mutual.spaces.map(renderItem)}
                      </Box>
                    )}
                    {mutual.rooms.length > 0 && (
                      <Box direction="Column" gap="100">
                        <Text style={{ paddingLeft: config.space.S100 }} size="L400">
                          Rooms
                        </Text>
                        {mutual.rooms.map(renderItem)}
                      </Box>
                    )}
                    {mutual.directs.length > 0 && (
                      <Box direction="Column" gap="100">
                        <Text style={{ paddingLeft: config.space.S100 }} size="L400">
                          Direct Messages
                        </Text>
                        {mutual.directs.map(renderItem)}
                      </Box>
                    )}
                  </Box>
                </Scroll>
              </Box>
            </Menu>
          </FocusTrap>
        ) : null
      }
    >
      <Chip
        radii="Pill"
        before={mutualRoomsState.status === AsyncStatus.Loading && <Spinner size="50" />}
        disabled={
          mutualRoomsState.status !== AsyncStatus.Success || mutualRoomsState.data.length === 0
        }
        onClick={open}
        aria-pressed={!!cords}
        className={css.UserHeroChip}
        style={{
          backgroundColor: cardColor,
          borderColor: backgroundColor,
          color: textColor,
        }}
      >
        <Text size="B300" style={{ color: textColor }}>
          {mutualRoomsState.status === AsyncStatus.Success &&
            `${mutualRoomsState.data.length} Mutual Rooms`}
          {mutualRoomsState.status === AsyncStatus.Loading && 'Mutual Rooms'}
        </Text>
      </Chip>
    </PopOut>
  );
}

export function IgnoredUserAlert() {
  return (
    <CutoutCard style={{ padding: config.space.S200 }} variant="Critical">
      <SettingTile>
        <Box direction="Column" gap="200">
          <Box gap="200" justifyContent="Center">
            <Text size="L400">Blocked User</Text>
          </Box>
          <Box direction="Column">
            <Text size="T200">You do not receive any messages or invites from this user.</Text>
          </Box>
        </Box>
      </SettingTile>
    </CutoutCard>
  );
}

export function OptionsChip({
  userId,
  backgroundColor,
  innerColor,
  cardColor,
  textColor,
}: {
  userId: string;
  backgroundColor?: string;
  innerColor?: string;
  cardColor?: string;
  textColor?: string;
}) {
  const mx = useMatrixClient();
  const [cords, setCords] = useState<RectCords>();
  const [editingNick, setEditingNick] = useState(false);
  const nickInputRef = useRef<HTMLInputElement>(null);

  const open: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setCords(evt.currentTarget.getBoundingClientRect());
  };

  const close = () => {
    setCords(undefined);
    setEditingNick(false);
  };

  const ignoredUsers = useIgnoredUsers();
  const ignored = ignoredUsers.includes(userId);

  const [ignoreState, toggleIgnore] = useAsyncCallback(
    useCallback(async () => {
      const users = ignoredUsers.filter((u) => u !== userId);
      if (!ignored) users.push(userId);
      await mx.setIgnoredUsers(users);
    }, [mx, ignoredUsers, userId, ignored])
  );
  const ignoring = ignoreState.status === AsyncStatus.Loading;

  const currentNick = useNickname(userId);
  const setNickname = useSetNickname();

  useEffect(() => {
    if (editingNick) {
      nickInputRef.current?.focus();
    }
  }, [editingNick]);

  const handleSaveNick = () => {
    const value = nickInputRef.current?.value ?? '';
    setNickname(userId, value || undefined);
    close();
  };

  const handleNickKeyDown: KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') handleSaveNick();
    if (e.key === 'Escape') close();
  };

  return (
    <PopOut
      anchor={cords}
      position="Bottom"
      align="Start"
      offset={4}
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: close,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
            isKeyForward: (evt: KeyboardEvent) => isKeyHotkey('arrowdown', evt),
            isKeyBackward: (evt: KeyboardEvent) => isKeyHotkey('arrowup', evt),
          }}
        >
          <Menu>
            <div style={{ padding: config.space.S100, backgroundColor: innerColor }}>
              {editingNick ? (
                <Box
                  direction="Column"
                  gap="100"
                  style={{ padding: `${config.space.S100} ${config.space.S200}` }}
                >
                  <Text size="L400">Nickname</Text>
                  <input
                    ref={nickInputRef}
                    defaultValue={currentNick ?? ''}
                    placeholder="Enter a nickname…"
                    onKeyDown={handleNickKeyDown}
                    style={{
                      background: 'var(--mx-c-surface)',
                      color: 'var(--mx-c-on-surface)',
                      border: '1px solid var(--mx-c-outline)',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '14px',
                      width: '100%',
                      outline: 'none',
                    }}
                  />
                  <Box gap="200">
                    <MenuItem
                      size="300"
                      radii="300"
                      variant="Success"
                      fill="None"
                      onClick={handleSaveNick}
                      style={{ backgroundColor: cardColor, color: textColor }}
                    >
                      <Text size="B300">Save</Text>
                    </MenuItem>
                    {currentNick && (
                      <MenuItem
                        size="300"
                        radii="300"
                        variant="Critical"
                        fill="None"
                        onClick={() => {
                          setNickname(userId, undefined);
                          close();
                        }}
                        style={{ backgroundColor: cardColor, color: textColor }}
                      >
                        <Text size="B300">Clear</Text>
                      </MenuItem>
                    )}
                  </Box>
                </Box>
              ) : (
                <MenuItem
                  variant="Surface"
                  fill="None"
                  size="300"
                  radii="300"
                  before={<Icon size="50" src={Icons.Pencil} />}
                  onClick={() => setEditingNick(true)}
                  style={{ backgroundColor: cardColor, color: textColor }}
                >
                  <Text size="B300">{currentNick ? 'Edit Nickname' : 'Set Nickname'}</Text>
                </MenuItem>
              )}
              <MenuItem
                variant="Critical"
                fill="None"
                size="300"
                radii="300"
                onClick={() => {
                  toggleIgnore();
                  close();
                }}
                style={{ backgroundColor: cardColor }}
                before={
                  ignoring ? (
                    <Spinner variant="Critical" size="50" />
                  ) : (
                    <Icon size="50" src={Icons.Prohibited} />
                  )
                }
                disabled={ignoring}
              >
                <Text size="B300" style={{ color: textColor }}>
                  {ignored ? 'Unblock User' : 'Block User'}
                </Text>
              </MenuItem>
            </div>
          </Menu>
        </FocusTrap>
      }
    >
      <Chip
        radii="Pill"
        onClick={open}
        aria-pressed={!!cords}
        className={css.UserHeroChip}
        style={{
          backgroundColor: cardColor,
          borderColor: backgroundColor,
          color: textColor,
        }}
      >
        {ignoring ? (
          <Spinner variant="Secondary" size="50" />
        ) : (
          <Icon size="50" src={Icons.HorizontalDots} />
        )}
      </Chip>
    </PopOut>
  );
}
