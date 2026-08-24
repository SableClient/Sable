import { useCallback, useEffect, useState } from 'react';
import { Box, IconButton, Menu, MenuItem, Text, config, Line, Spinner, toRem } from 'folds';
import type { HierarchyItem } from '$hooks/useSpaceHierarchy';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { MSpaceChildContent } from '$types/matrix/room';
import type { StateEvents } from '$types/matrix-sdk';

import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { LeaveSpacePrompt } from '$components/leave-space-prompt';
import { confirm } from '$components/confirm/confirm';
import { showToast } from '$state/toast';
import { ResponsiveMenu } from '$components/ResponsiveMenu';
import { useMenuAnchor } from '$hooks/useMenuAnchor';
import { useOpenRoomSettings } from '$state/hooks/roomSettings';
import { useSpaceOptionally } from '$hooks/useSpace';
import type { IPowerLevels } from '$hooks/usePowerLevels';
import { getRoomCreatorsForRoomId } from '$hooks/useRoomCreators';
import { getRoomPermissionsAPI } from '$hooks/useRoomPermissions';
import { InviteUserPrompt } from '$components/invite-user-prompt';
import { getCanonicalAliasOrRoomId } from '$utils/matrix';
import { useNavigate } from 'react-router';
import { getSpaceLobbyPath } from '$pages/pathUtils';
import { EventType } from '$types/matrix-sdk';
import {
  chipIcon,
  DotsThreeOutlineVerticalIcon,
  menuIcon,
  SignOut,
} from '$components/icons/phosphor';

type HierarchyItemWithParent = HierarchyItem & {
  parentId: string;
};

function SuggestMenuItem({
  item,
  requestClose,
}: {
  item: HierarchyItemWithParent;
  requestClose: () => void;
}) {
  const mx = useMatrixClient();
  const { roomId, parentId, content } = item;

  const [toggleState, handleToggleSuggested] = useAsyncCallback(
    useCallback(() => {
      const newContent: MSpaceChildContent = { ...content, suggested: !content.suggested };
      return mx.sendStateEvent(
        parentId,
        EventType.SpaceChild as keyof StateEvents,
        newContent,
        roomId
      );
    }, [mx, parentId, roomId, content])
  );

  useEffect(() => {
    if (toggleState.status === AsyncStatus.Success) {
      requestClose();
    }
  }, [requestClose, toggleState]);

  return (
    <MenuItem
      onClick={handleToggleSuggested}
      size="300"
      radii="300"
      before={toggleState.status === AsyncStatus.Loading && <Spinner size="100" />}
      disabled={toggleState.status === AsyncStatus.Loading}
    >
      <Text as="span" size="T300" truncate>
        {content.suggested ? 'Unset Suggested' : 'Set Suggested'}
      </Text>
    </MenuItem>
  );
}

function RemoveMenuItem({
  item,
  requestClose,
}: {
  item: HierarchyItemWithParent;
  requestClose: () => void;
}) {
  const mx = useMatrixClient();
  const { roomId, parentId } = item;

  const [removeState, handleRemove] = useAsyncCallback(
    useCallback(
      () => mx.sendStateEvent(parentId, EventType.SpaceChild as keyof StateEvents, {}, roomId),
      [mx, parentId, roomId]
    )
  );

  useEffect(() => {
    if (removeState.status === AsyncStatus.Success) {
      requestClose();
    }
  }, [requestClose, removeState]);

  return (
    <MenuItem
      onClick={handleRemove}
      variant="Critical"
      fill="None"
      size="300"
      radii="300"
      before={
        removeState.status === AsyncStatus.Loading && (
          <Spinner variant="Critical" fill="Soft" size="100" />
        )
      }
      disabled={removeState.status === AsyncStatus.Loading}
    >
      <Text as="span" size="T300" truncate>
        Remove
      </Text>
    </MenuItem>
  );
}

function InviteMenuItem({
  item,
  requestClose,
  disabled,
}: {
  item: HierarchyItemWithParent;
  requestClose: () => void;
  disabled?: boolean;
}) {
  const mx = useMatrixClient();
  const room = mx.getRoom(item.roomId);
  const [invitePrompt, setInvitePrompt] = useState(false);

  const handleInvite = () => {
    setInvitePrompt(true);
  };

  return (
    <>
      <MenuItem
        onClick={handleInvite}
        size="300"
        radii="300"
        variant="Primary"
        fill="None"
        aria-pressed={invitePrompt}
        disabled={disabled || !room}
      >
        <Text as="span" size="T300" truncate>
          Invite
        </Text>
      </MenuItem>
      {invitePrompt && room && (
        <InviteUserPrompt
          room={room}
          requestClose={() => {
            setInvitePrompt(false);
            requestClose();
          }}
        />
      )}
    </>
  );
}

function SettingsMenuItem({
  item,
  requestClose,
  disabled,
}: {
  item: HierarchyItemWithParent;
  requestClose: () => void;
  disabled?: boolean;
}) {
  const openRoomSettings = useOpenRoomSettings();
  const space = useSpaceOptionally();

  const handleSettings = () => {
    if ('space' in item) {
      openRoomSettings(item.roomId, item.parentId);
    } else {
      openRoomSettings(item.roomId, space?.roomId);
    }
    requestClose();
  };

  return (
    <MenuItem onClick={handleSettings} size="300" radii="300" disabled={disabled}>
      <Text as="span" size="T300" truncate>
        Settings
      </Text>
    </MenuItem>
  );
}

type HierarchyItemMenuProps = {
  item: HierarchyItem & {
    parentId: string;
  };
  joined: boolean;
  powerLevels?: IPowerLevels;
  canEditChild: boolean;
  pinned?: boolean;
  onTogglePin?: (roomId: string) => void;
};
export function HierarchyItemMenu({
  item,
  joined,
  powerLevels,
  canEditChild,
  pinned,
  onTogglePin,
}: HierarchyItemMenuProps) {
  const mx = useMatrixClient();
  const menu = useMenuAnchor<HTMLButtonElement>();

  const canInvite = (): boolean => {
    if (!powerLevels) return false;
    const creators = getRoomCreatorsForRoomId(mx, item.roomId);
    const permissions = getRoomPermissionsAPI(creators, powerLevels);

    return permissions.action('invite', mx.getSafeUserId());
  };

  const navigate = useNavigate();

  const [promptLeaveSpace, setPromptLeaveSpace] = useState(false);

  const handleLeaveRoom = async () => {
    const ok = await confirm({
      title: 'Leave Room',
      description: 'Are you sure you want to leave this room?',
      action: 'Leave',
      variant: 'Critical',
    });
    if (ok) {
      try {
        await mx.leave(item.roomId);
        menu.close();
      } catch (e) {
        showToast(`Failed to leave room: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    }
  };

  if (!joined && !canEditChild) {
    return null;
  }

  return (
    <Box gap="200" alignItems="Center" shrink="No">
      <ResponsiveMenu
        anchor={menu.anchor}
        requestClose={menu.close}
        position="Bottom"
        align="End"
        menu={
          <Menu style={{ maxWidth: toRem(150), width: '100vw' }}>
            {joined && (
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                {onTogglePin && (
                  <MenuItem
                    size="300"
                    radii="300"
                    onClick={() => {
                      onTogglePin(item.roomId);
                      menu.close();
                    }}
                  >
                    <Text as="span" size="T300" truncate>
                      {pinned ? 'Unpin from Sidebar' : 'Pin to Sidebar'}
                    </Text>
                  </MenuItem>
                )}
                <MenuItem
                  size="300"
                  radii="300"
                  onClick={() => {
                    navigate(getSpaceLobbyPath(getCanonicalAliasOrRoomId(mx, item.roomId)));
                  }}
                >
                  <Text as="span" size="T300" truncate>
                    Open Lobby
                  </Text>
                </MenuItem>
                <InviteMenuItem item={item} requestClose={menu.close} disabled={!canInvite()} />
                <SettingsMenuItem item={item} requestClose={menu.close} />
                <MenuItem
                  onClick={() => {
                    if ('space' in item) {
                      setPromptLeaveSpace(true);
                    } else {
                      handleLeaveRoom();
                    }
                  }}
                  variant="Critical"
                  fill="None"
                  size="300"
                  after={menuIcon(SignOut)}
                  radii="300"
                  aria-pressed={promptLeaveSpace}
                >
                  <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                    Leave
                  </Text>
                </MenuItem>
                {promptLeaveSpace && 'space' in item && (
                  <LeaveSpacePrompt
                    roomId={item.roomId}
                    onDone={menu.close}
                    onCancel={() => setPromptLeaveSpace(false)}
                  />
                )}
              </Box>
            )}
            {(joined || canEditChild) && (
              <Line size="300" variant="Surface" direction="Horizontal" />
            )}
            {canEditChild && (
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                <SuggestMenuItem item={item} requestClose={menu.close} />
                <RemoveMenuItem item={item} requestClose={menu.close} />
              </Box>
            )}
          </Menu>
        }
      >
        <IconButton
          onClick={menu.triggerProps.onClick}
          size="300"
          variant="SurfaceVariant"
          fill="None"
          radii="300"
          aria-pressed={!!menu.anchor}
        >
          {chipIcon(DotsThreeOutlineVerticalIcon, { weight: menu.anchor ? 'fill' : 'regular' })}
        </IconButton>
      </ResponsiveMenu>
    </Box>
  );
}
