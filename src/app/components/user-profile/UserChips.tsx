import type { KeyboardEventHandler } from 'react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { isTauri } from '@tauri-apps/api/core';
import type { Room } from '$types/matrix-sdk';
import {
  Menu,
  MenuItem,
  config,
  Text,
  Line,
  Chip,
  Spinner,
  toRem,
  Box,
  Scroll,
  Avatar,
} from 'folds';
import {
  CaretDown,
  Check,
  DotsThree,
  HardDrives,
  Link,
  PencilSimple,
  profileIcon,
  Prohibit,
} from '$components/icons/phosphor';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { getMxIdServer } from '$utils/mxIdHelper';
import { useCloseUserRoomProfile } from '$state/hooks/userRoomProfile';
import { copyToClipboard } from '$utils/dom';
import { shareText } from '$utils/share';
import { getExploreServerPath } from '$pages/pathUtils';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { factoryRoomIdByAtoZ } from '$utils/sort';
import {
  useMutualRooms,
  useMutualRoomsSupport,
  useUnstableMutualRoomsSupport,
} from '$hooks/useMutualRooms';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { useDirectRooms } from '$pages/client/direct/useDirectRooms';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';
import { getDirectRoomAvatarUrl, getRoomAvatarUrl } from '$utils/room/display';
import { nameInitials } from '$utils/common';
import { getMatrixToUser } from '$plugins/matrix-to';
import { useTimeoutToggle } from '$hooks/useTimeoutToggle';
import { useIgnoredUsers } from '$hooks/useIgnoredUsers';
import { useNickname, useSetNickname } from '$hooks/useNickname';
import { CutoutCard } from '$components/cutout-card';
import { SettingTile } from '$components/setting-tile';
import { RoomAvatar, RoomIcon } from '$components/room-avatar';
import { heroMenuItemStyle } from './heroMenuItemStyle';
import * as css from './styles.css';
import { ResponsiveMenu } from '$components/ResponsiveMenu';
import { useMenuAnchor } from '$hooks/useMenuAnchor';

export function ServerChip({
  server,
  innerColor,
  cardColor,
  textColor,
  chipSurfaceStyle,
  chipFillColor,
  chipHoverBrightness,
}: {
  server: string;
  innerColor?: string;
  cardColor?: string;
  textColor?: string;
  chipSurfaceStyle?: CSSProperties;
  chipFillColor?: string;
  chipHoverBrightness?: number;
}) {
  const menuItemBg = chipFillColor ?? cardColor;
  const mx = useMatrixClient();
  const myServer = getMxIdServer(mx.getSafeUserId());
  const navigate = useNavigate();
  const closeProfile = useCloseUserRoomProfile();
  const [copied, setCopied] = useTimeoutToggle();

  const serverMenu = useMenuAnchor<HTMLButtonElement>();

  return (
    <ResponsiveMenu
      anchor={serverMenu.anchor}
      requestClose={serverMenu.close}
      position="Bottom"
      align="Start"
      offset={4}
      returnFocusOnDeactivate
      surfaceColor={cardColor ? innerColor : undefined}
      menu={
        <Menu>
          <div
            style={{
              padding: config.space.S200,
              maxWidth: toRem(200),
              backgroundColor: innerColor,
            }}
          >
            <Box direction="Column" gap="100">
              <MenuItem
                fill="None"
                size="300"
                radii="300"
                onClick={() => {
                  copyToClipboard(server);
                  setCopied();
                  serverMenu.close();
                }}
                className={css.UserHeroMenuItem}
                style={heroMenuItemStyle(
                  {
                    backgroundColor: menuItemBg,
                    color: textColor,
                  },
                  chipHoverBrightness
                )}
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
                className={css.UserHeroMenuItem}
                style={heroMenuItemStyle(
                  {
                    backgroundColor: menuItemBg,
                    color: textColor,
                  },
                  chipHoverBrightness
                )}
              >
                <Text size="B300">Explore Community</Text>
              </MenuItem>
            </Box>
          </div>
          <Line size="300" />
          <div
            style={{
              padding: config.space.S200,
              backgroundColor: innerColor,
              color: textColor,
            }}
          >
            <Box direction="Column" gap="100">
              <MenuItem
                fill="None"
                size="300"
                radii="300"
                onClick={() => {
                  const url = `https://${server}`;
                  serverMenu.close();
                  if (isTauri()) {
                    import('@tauri-apps/plugin-opener')
                      .then(({ openUrl }) => openUrl(url))
                      .catch(() => window.open(url, '_blank'));
                    return;
                  }
                  window.open(url, '_blank');
                }}
                className={css.UserHeroMenuItem}
                style={heroMenuItemStyle(
                  {
                    backgroundColor: menuItemBg,
                    color: textColor,
                  },
                  chipHoverBrightness
                )}
              >
                <Text size="B300">Open in Browser</Text>
              </MenuItem>
            </Box>
          </div>
        </Menu>
      }
    >
      <Chip
        variant={cardColor ? undefined : myServer === server ? 'SurfaceVariant' : 'Warning'}
        radii="Pill"
        before={
          serverMenu.anchor ? profileIcon(CaretDown) : profileIcon(copied ? Check : HardDrives)
        }
        onClick={serverMenu.triggerProps.onClick}
        aria-pressed={!!serverMenu.anchor}
        className={cardColor ? css.UserHeroChipThemed : css.UserHeroBrightnessHover}
        style={heroMenuItemStyle(
          cardColor && chipSurfaceStyle ? chipSurfaceStyle : {},
          chipHoverBrightness
        )}
      >
        <Text size="B300" truncate>
          {server}
        </Text>
      </Chip>
    </ResponsiveMenu>
  );
}

export function ShareChip({
  userId,
  innerColor,
  cardColor,
  textColor,
  chipSurfaceStyle,
  chipFillColor,
  chipHoverBrightness,
}: {
  userId: string;
  innerColor?: string;
  cardColor?: string;
  textColor?: string;
  chipSurfaceStyle?: CSSProperties;
  chipFillColor?: string;
  chipHoverBrightness?: number;
}) {
  const menuItemBg = chipFillColor ?? cardColor;
  const shareMenu = useMenuAnchor<HTMLButtonElement>();

  const [copied, setCopied] = useTimeoutToggle();

  return (
    <ResponsiveMenu
      anchor={shareMenu.anchor}
      requestClose={shareMenu.close}
      position="Bottom"
      align="Start"
      offset={4}
      returnFocusOnDeactivate
      surfaceColor={cardColor ? innerColor : undefined}
      menu={
        <Menu>
          <div style={{ padding: config.space.S200, backgroundColor: innerColor }}>
            <Box direction="Column" gap="100">
              <MenuItem
                fill="None"
                size="300"
                radii="300"
                className={css.UserHeroMenuItem}
                style={heroMenuItemStyle(
                  {
                    backgroundColor: menuItemBg,
                    color: textColor,
                  },
                  chipHoverBrightness
                )}
                onClick={() => {
                  copyToClipboard(userId);
                  setCopied();
                  shareMenu.close();
                }}
              >
                <Text size="B300">Copy User ID</Text>
              </MenuItem>
              <MenuItem
                fill="None"
                size="300"
                radii="300"
                className={css.UserHeroMenuItem}
                style={heroMenuItemStyle(
                  {
                    backgroundColor: menuItemBg,
                    color: textColor,
                  },
                  chipHoverBrightness
                )}
                onClick={() => {
                  copyToClipboard(getMatrixToUser(userId));
                  setCopied();
                  shareMenu.close();
                }}
              >
                <Text size="B300">Copy User Link</Text>
              </MenuItem>
              <MenuItem
                fill="None"
                size="300"
                radii="300"
                className={css.UserHeroMenuItem}
                style={heroMenuItemStyle(
                  {
                    backgroundColor: menuItemBg,
                    color: textColor,
                  },
                  chipHoverBrightness
                )}
                onClick={async () => {
                  const shared = await shareText(getMatrixToUser(userId));
                  if (shared) setCopied();
                  shareMenu.close();
                }}
              >
                <Text size="B300">Share User Link</Text>
              </MenuItem>
            </Box>
          </div>
        </Menu>
      }
    >
      <Chip
        variant={copied ? 'Success' : cardColor ? undefined : 'SurfaceVariant'}
        radii="Pill"
        before={shareMenu.anchor ? profileIcon(CaretDown) : profileIcon(copied ? Check : Link)}
        onClick={shareMenu.triggerProps.onClick}
        aria-pressed={!!shareMenu.anchor}
        className={!copied && cardColor ? css.UserHeroChipThemed : css.UserHeroBrightnessHover}
        style={heroMenuItemStyle(
          cardColor && !copied && chipSurfaceStyle ? chipSurfaceStyle : {},
          chipHoverBrightness
        )}
      >
        <Text size="B300" truncate>
          Share
        </Text>
      </Chip>
    </ResponsiveMenu>
  );
}

type MutualRoomsData = {
  rooms: Room[];
  spaces: Room[];
  directs: Room[];
};

export function MutualRoomsChip({
  userId,
  innerColor,
  cardColor,
  textColor,
  chipSurfaceStyle,
  chipFillColor,
  chipHoverBrightness,
}: {
  userId: string;
  innerColor?: string;
  cardColor?: string;
  textColor?: string;
  chipSurfaceStyle?: CSSProperties;
  chipFillColor?: string;
  chipHoverBrightness?: number;
}) {
  const menuItemBg = chipFillColor ?? cardColor;
  const mx = useMatrixClient();
  const mutualRoomSupported = useMutualRoomsSupport();
  const mutualRoomUnstable = useUnstableMutualRoomsSupport();
  const mutualRoomsState = useMutualRooms(userId);
  const { navigateRoom, navigateSpace } = useRoomNavigate();
  const closeUserRoomProfile = useCloseUserRoomProfile();
  const directs = useDirectRooms();
  const useAuthentication = useMediaAuthentication();

  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);

  const mutualMenu = useMenuAnchor<HTMLButtonElement>();

  const mutual: MutualRoomsData = useMemo(() => {
    const data: MutualRoomsData = {
      rooms: [],
      spaces: [],
      directs: [],
    };

    if (mutualRoomsState.status === AsyncStatus.Success) {
      const mutualRooms = mutualRoomsState.data
        .toSorted(factoryRoomIdByAtoZ(mx))
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
    (!mutualRoomSupported && !mutualRoomUnstable) ||
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
        className={css.UserHeroMenuItem}
        style={heroMenuItemStyle(
          {
            paddingLeft: config.space.S100,
            backgroundColor: menuItemBg,
            color: textColor,
          },
          chipHoverBrightness
        )}
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
    <ResponsiveMenu
      anchor={mutualMenu.anchor}
      requestClose={mutualMenu.close}
      position="Bottom"
      align="Start"
      offset={4}
      returnFocusOnDeactivate
      surfaceColor={cardColor ? innerColor : undefined}
      menu={
        mutualRoomsState.status === AsyncStatus.Success ? (
          <Menu
            style={{
              display: 'flex',
              maxWidth: toRem(200),
              maxHeight: '80dvh',
              backgroundColor: innerColor,
            }}
          >
            <Box grow="Yes" style={{ minHeight: 0 }}>
              <Scroll
                size="300"
                hideTrack
                style={{
                  maxHeight: 'calc(80vh - 2rem)',
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
                  touchAction: 'pan-y',
                }}
              >
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
        ) : null
      }
    >
      <Chip
        variant={cardColor ? undefined : 'SurfaceVariant'}
        radii="Pill"
        before={mutualRoomsState.status === AsyncStatus.Loading && <Spinner size="50" />}
        disabled={
          mutualRoomsState.status !== AsyncStatus.Success || mutualRoomsState.data.length === 0
        }
        onClick={mutualMenu.triggerProps.onClick}
        aria-pressed={!!mutualMenu.anchor}
        className={cardColor ? css.UserHeroChipThemed : css.UserHeroBrightnessHover}
        style={heroMenuItemStyle(
          cardColor && chipSurfaceStyle ? chipSurfaceStyle : {},
          chipHoverBrightness
        )}
      >
        <Text size="B300" style={{ color: textColor }}>
          {mutualRoomsState.status === AsyncStatus.Success &&
            `${mutualRoomsState.data.length} Mutual Rooms`}
          {mutualRoomsState.status === AsyncStatus.Loading && 'Mutual Rooms'}
        </Text>
      </Chip>
    </ResponsiveMenu>
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
  innerColor,
  cardColor,
  textColor,
  chipSurfaceStyle,
  chipFillColor,
  chipHoverBrightness,
}: {
  userId: string;
  innerColor?: string;
  cardColor?: string;
  textColor?: string;
  chipSurfaceStyle?: CSSProperties;
  chipFillColor?: string;
  chipHoverBrightness?: number;
}) {
  const menuItemBg = chipFillColor ?? cardColor;
  const mx = useMatrixClient();
  const optionsMenu = useMenuAnchor<HTMLButtonElement>();
  const [editingNick, setEditingNick] = useState(false);
  const nickInputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    optionsMenu.close();
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
    <ResponsiveMenu
      anchor={optionsMenu.anchor}
      requestClose={close}
      position="Bottom"
      align="Start"
      offset={4}
      returnFocusOnDeactivate
      surfaceColor={cardColor ? innerColor : undefined}
      menu={
        <Menu>
          <div style={{ padding: config.space.S200, backgroundColor: innerColor }}>
            <Box direction="Column" gap="100">
              {editingNick ? (
                <Box direction="Column" gap="100" style={{ color: textColor }}>
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
                      className={css.UserHeroMenuItem}
                      style={heroMenuItemStyle(
                        {
                          backgroundColor: menuItemBg,
                          color: textColor,
                        },
                        chipHoverBrightness
                      )}
                    >
                      <Text size="B300">Save</Text>
                    </MenuItem>
                    {currentNick && (
                      <MenuItem
                        size="300"
                        radii="300"
                        variant="Critical"
                        fill="None"
                        className={css.UserHeroMenuItem}
                        onClick={() => {
                          setNickname(userId, undefined);
                          close();
                        }}
                        style={heroMenuItemStyle(
                          {
                            backgroundColor: menuItemBg,
                            color: textColor,
                          },
                          chipHoverBrightness
                        )}
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
                  before={profileIcon(PencilSimple)}
                  onClick={() => setEditingNick(true)}
                  className={css.UserHeroMenuItem}
                  style={heroMenuItemStyle(
                    {
                      backgroundColor: menuItemBg,
                      color: textColor,
                    },
                    chipHoverBrightness
                  )}
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
                className={css.UserHeroMenuItem}
                style={heroMenuItemStyle({ backgroundColor: menuItemBg }, chipHoverBrightness)}
                before={ignoring ? <Spinner variant="Critical" size="50" /> : profileIcon(Prohibit)}
                disabled={ignoring}
              >
                <Text size="B300" style={{ color: textColor }}>
                  {ignored ? 'Unblock User' : 'Block User'}
                </Text>
              </MenuItem>
            </Box>
          </div>
        </Menu>
      }
    >
      <Chip
        variant={cardColor ? undefined : 'SurfaceVariant'}
        radii="Pill"
        onClick={optionsMenu.triggerProps.onClick}
        aria-pressed={!!optionsMenu.anchor}
        className={cardColor ? css.UserHeroChipThemed : css.UserHeroBrightnessHover}
        style={heroMenuItemStyle(
          cardColor && chipSurfaceStyle ? chipSurfaceStyle : {},
          chipHoverBrightness
        )}
      >
        {ignoring ? <Spinner variant="Secondary" size="50" /> : profileIcon(DotsThree)}
      </Chip>
    </ResponsiveMenu>
  );
}
